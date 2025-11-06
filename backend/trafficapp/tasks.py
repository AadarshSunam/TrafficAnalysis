# trafficapp/tasks.py
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
from django.db.models import Sum
from django.conf import settings
from django.core.mail import send_mail
import requests
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from .models import AlertRule, AlertLog
from .models import VehicleCount  # your ingestion model

@shared_task
def evaluate_alert_rules():
    now = timezone.now()
    # look at the last window (e.g. 5 minutes)
    recent_window_minutes = 5
    window_start = now - timedelta(minutes=recent_window_minutes)

    rules = AlertRule.objects.filter(active=True)
    for rule in rules:
        try:
            qs = VehicleCount.objects.filter(timestamp__gte=window_start)
            # apply filters
            if rule.scenarios:
                qs = qs.filter(scenario__in=rule.scenarios)
            if rule.directions:
                qs = qs.filter(direction__in=rule.directions)
            if rule.vehicle_classes:
                # vehicle_class stored as FK with name field; adjust if necessary
                qs = qs.filter(vehicle_class__name__in=rule.vehicle_classes)

            recent_total = qs.aggregate(total=Sum("count"))["total"] or 0
            details = {"recent_total": recent_total, "window_minutes": recent_window_minutes}

            triggered = False

            if rule.rule_type == "absolute":
                triggered = recent_total >= rule.threshold

            elif rule.rule_type == "percent_spike":
                baseline_start = now - timedelta(hours=2)
                baseline_qs = VehicleCount.objects.filter(timestamp__gte=baseline_start, timestamp__lt=window_start)
                if rule.scenarios:
                    baseline_qs = baseline_qs.filter(scenario__in=rule.scenarios)
                if rule.directions:
                    baseline_qs = baseline_qs.filter(direction__in=rule.directions)
                if rule.vehicle_classes:
                    baseline_qs = baseline_qs.filter(vehicle_class__name__in=rule.vehicle_classes)

                baseline_total = baseline_qs.aggregate(total=Sum("count"))["total"] or 1
                pct = (recent_total - baseline_total) / max(1, baseline_total) * 100
                details.update({"baseline_total": baseline_total, "percent_change": pct})
                triggered = pct >= rule.threshold

            elif rule.rule_type == "sustained":
                minutes = max(1, rule.sustained_minutes)
                start = now - timedelta(minutes=minutes)
                sustain_qs = VehicleCount.objects.filter(timestamp__gte=start)
                if rule.scenarios:
                    sustain_qs = sustain_qs.filter(scenario__in=rule.scenarios)
                if rule.directions:
                    sustain_qs = sustain_qs.filter(direction__in=rule.directions)
                if rule.vehicle_classes:
                    sustain_qs = sustain_qs.filter(vehicle_class__name__in=rule.vehicle_classes)
                sustain_total = sustain_qs.aggregate(total=Sum("count"))["total"] or 0
                details.update({"sustained_total": sustain_total, "sustained_minutes": minutes})
                triggered = sustain_total >= rule.threshold

            if triggered:
                # cooldown check
                last_log = AlertLog.objects.filter(rule=rule).order_by("-timestamp").first()
                if last_log and (now - last_log.timestamp).total_seconds() < rule.cooldown_seconds:
                    continue

                al = AlertLog.objects.create(
                    rule=rule,
                    scenario=",".join(rule.scenarios or []),
                    direction=",".join(rule.directions or []),
                    vehicle_class=",".join(rule.vehicle_classes or []),
                    details=details
                )

                # send emails
                sent_emails = []
                if rule.emails:
                    emails = [e.strip() for e in rule.emails.split(",") if e.strip()]
                    if emails:
                        subject = f"[Traffic Alert] {rule.name}"
                        body = f"Rule: {rule.name}\nTime: {now.isoformat()}\nDetails: {details}"
                        try:
                            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, emails, fail_silently=False)
                            sent_emails = emails
                        except Exception as e:
                            # don't crash; log error in webhook_status field
                            al.webhook_status = f"email_error: {str(e)}"
                al.sent_emails = ",".join(sent_emails)
                al.save()

                # webhook
                webhook_status = ""
                if rule.webhook_url:
                    try:
                        r = requests.post(rule.webhook_url, json={"rule": rule.name, "details": details, "timestamp": now.isoformat()}, timeout=5)
                        webhook_status = f"{r.status_code}"
                    except Exception as e:
                        webhook_status = f"error:{str(e)}"
                    al.webhook_status = webhook_status
                    al.save()

                # broadcast to channels group "alerts"
                try:
                    channel_layer = get_channel_layer()
                    async_to_sync(channel_layer.group_send)(
                        "alerts",
                        {
                            "type": "alert.message",
                            "alert": {
                                "id": al.id,
                                "rule": rule.name,
                                "details": details,
                                "timestamp": now.isoformat(),
                            },
                        },
                    )
                except Exception:
                    pass

        except Exception:
            # ensure one rule error doesn't stop others
            continue
