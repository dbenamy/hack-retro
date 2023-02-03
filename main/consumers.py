import json

from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer

from main.models import *


def init_msg(retro: Retro):
    return {
        "type": "init",
        "state": retro.state,
        "people": [people_dict(p) for p in retro.people.all()],
        "topics": [topic_dict(t) for t in retro.topics.all()],
        "clusters": [cluster_dict(c) for c in retro.clusters.all()],
        "actions": [a.text for a in retro.action_items.all()],
    }


def people_dict(person: Person):
    return {
        "name": person.name,
        "numVotes": len(person.votes),
    }


def topic_dict(topic: Topic):
    return {
        "text": topic.text,
        "feeling": topic.feeling,
        "x": topic.x,
        "y": topic.y,
    }


def cluster_dict(cluster: Cluster):
    return {
        "id": cluster.pk,
        "topics": [t.text for t in cluster.topics.all()],  # TODO switch to topic ids
        "votes": cluster.votes,
    }


# TODO Rewrite as async- https://channels.readthedocs.io/en/stable/tutorial/part_3.html#rewrite-the-consumer-to-be-asynchronous
class RetroConsumer(WebsocketConsumer):
    def connect(self):
        self.retro_uuid = self.scope["url_route"]["kwargs"][
            "room_name"
        ]  # TODO update param name
        self.person_name = None

        self.channel_group_name = "retro_%s" % self.retro_uuid

        async_to_sync(self.channel_layer.group_add)(
            self.channel_group_name, self.channel_name
        )

        self.accept()

        retro = Retro.objects.get(uuid=self.retro_uuid)
        self.send(text_data=json.dumps(init_msg(retro)))

    def disconnect(self, close_code):
        async_to_sync(self.channel_layer.group_discard)(
            self.channel_group_name, self.channel_name
        )

    def receive(self, text_data):
        retro = Retro.objects.get(uuid=self.retro_uuid)
        person = None
        if self.person_name:
            person = retro.people.filter(name=self.person_name).first()
        action = json.loads(text_data)

        # TODO maybe move this into connect()
        if action["type"] == "join":
            # Whether or not the retro is in the initial joining stage, add them
            # to the list of users.
            self.person_name = action["name"]
            retro.people.get_or_create(name=action["name"])
            async_to_sync(self.channel_layer.group_send)(
                self.channel_group_name, {"type": "join", "name": self.person_name}
            )
            if retro.state != "joining":
                # Send init to jump to wherever the retro is up to.
                self.send(text_data=json.dumps(init_msg(retro)))

        if retro.state == "joining":
            if action["type"] == "start":
                retro.state = "brainstorming"
                retro.save()
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name, {"type": "send_init"}
                )
        elif retro.state == "brainstorming":
            if action["type"] == "addTopic":
                retro.topics.create(text=action["text"], feeling=action["list"])
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name,
                    {
                        "type": "add_topic",
                        "list": action["list"],
                        "text": action["text"],
                    },
                )
            elif action["type"] == "goToGrouping":
                retro.state = "grouping"
                retro.set_initial_topic_positions()
                retro.save()
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name, {"type": "send_init"}
                )
        elif retro.state == "grouping":
            if action["type"] == "moveTopic":
                t = retro.topics.filter(text=action["text"]).first()
                t.x = action["x"]
                t.y = action["y"]
                # TODO:
                # Once we have a persistent datastore though, we probably won't
                # want to write every tiny little move to it (assuming we have a
                # scheme to ensure that all users in a given retro will talk to the
                # same app/web server). When we get there, we'll split this into 2
                # actions: while-being-dragged movements, of which there will be
                # many and which we will replicate to other browsers but not
                # persist to the db, and done-with-drag movements which we will.
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name,
                    {
                        "type": "move_topic",
                        "text": action["text"],
                        "x": action["x"],
                        "y": action["y"],
                    },
                )
            elif action["type"] == "goToVoting":
                for ac in action["clusters"]:
                    topics = retro.topics.filter(text__in=ac)
                    cluster = retro.clusters.create()
                    cluster.topics.set(topics)
                retro.state = "voting"
                retro.save()
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name, {"type": "send_init"}
                )
        elif retro.state == "voting":
            if action["type"] == "setVotes":
                person.votes = [int(v) for v in action["votes"]]
                person.save()
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name,
                    {
                        "type": "update_votes",
                    },
                )
            elif action["type"] == "goToDiscussion":
                retro.tally_votes_and_save()
                retro.state = "discussion"
                retro.save()
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name, {"type": "send_init"}
                )
        elif retro.state == "discussion":
            if action["type"] == "addAction":
                retro.action_items.create(text=action["text"])
                # Kind of a hack but just re-init
                async_to_sync(self.channel_layer.group_send)(
                    self.channel_group_name, {"type": "send_init"}
                )

    def join(self, event):
        self.send(text_data=json.dumps({"type": "join", "name": event["name"]}))

    def send_init(self, event):
        retro = Retro.objects.get(uuid=self.retro_uuid)
        self.send(text_data=json.dumps(init_msg(retro)))

    def add_topic(self, event):
        self.send(
            text_data=json.dumps(
                {
                    "type": "addTopic",
                    "list": event["list"],
                    "text": event["text"],
                }
            )
        )

    def move_topic(self, event):
        self.send(
            text_data=json.dumps(
                {
                    "type": "moveTopic",
                    "text": event["text"],
                    "x": event["x"],
                    "y": event["y"],
                }
            )
        )

    def update_votes(self, event):
        retro = Retro.objects.get(uuid=self.retro_uuid)
        self.send(
            text_data=json.dumps(
                {
                    "type": "updateVotes",
                    "people": [people_dict(p) for p in retro.people.all()],
                }
            )
        )
