from setuptools import setup, find_packages

setup(
    name="pipeline",
    version="0.1",
    packages=find_packages(),  # finds your pipeline/ folder
    install_requires=[
        "ultralytics",
        "opencv-python",
        "pyyaml",
        # any other dependencies you need
    ],
)
