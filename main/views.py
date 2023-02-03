import os.path

from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404, render
from django.views.static import serve

from main.models import Retro


def index(request):
    return render(request, "index.html")


def retros(request, id):
    if request.method == "POST":
        r = Retro.objects.create()
        return HttpResponseRedirect(f"/retros/{r.uuid}")
    get_object_or_404(Retro, uuid=id)  # just make sure it exists
    return static(request, "retro.html")


def static(request, path):
    full_path = os.path.normpath(settings.STATIC_DIR / path)
    # Probably not necessary as at least basic requests with .. in the path
    # don't even get in here, but leaving it just in case.
    if ".." in full_path:
        raise Exception("Invalid path")
    return serve(request, os.path.basename(full_path), os.path.dirname(full_path))
