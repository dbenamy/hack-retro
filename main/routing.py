from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(
        r"ws/retro/(?P<retro_id>[-A-Za-z0-9]+)/$", consumers.RetroConsumer.as_asgi()
    ),
]
