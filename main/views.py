import os.path

from django.shortcuts import render
from django.http import HttpResponse
from django.conf import settings
from django.views.static import serve


def index(request):
    return static(request, "index.html")


def static(request, path):
    full_path = os.path.normpath(settings.STATIC_DIR / path)
    # Probably not necessary as at least basic requests with .. in the path
    # don't even get in here, but leaving it just in case.
    if ".." in full_path:
        raise Exception("Invalid path")
    return serve(request, os.path.basename(full_path), os.path.dirname(full_path))
