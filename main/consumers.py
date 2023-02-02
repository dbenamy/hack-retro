from dataclasses import dataclass, field
from random import randint
import json

from asgiref.sync import async_to_sync
from channels.generic.websocket import WebsocketConsumer


# Keep these values in sync with the values in the html
GROUPING_WORKSPACE_HEIGHT = 800
GROUPING_WORKSPACE_WIDTH = 1400


@dataclass
class Person:
    name: str
    votes: list[int] = field(default_factory=list)  # cluster ids


@dataclass
class Topic:
    text: str
    feeling: str  # happy, sad, or confused
    x: int
    y: int


@dataclass
class Cluster:
    id_: int  # only unique within a retro
    topics: list[Topic] = field(default_factory=list)
    votes: int = 0


@dataclass
class Retro:
    pk: str
    state: str = "joining"
    people: list[Person] = field(default_factory=list)
    topics: list[Topic] = field(default_factory=list)
    clusters: list[Cluster] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)

    def set_initial_topic_positions(self):
        for t in self.topics:
            # TODO prevent overlap with the edge of the workspace
            t.x = randint(0, GROUPING_WORKSPACE_WIDTH)
            t.y = randint(0, GROUPING_WORKSPACE_HEIGHT)

    def get_topic_by_text(self, text: str) -> Topic:
        # TODO this will become more efficient when topics get ids
        for t in self.topics:
            if t.text == text:
                return t
        raise Exception("No such topic")

    def tally_votes(self) -> None:
        clusters_by_id = {}
        for c in self.clusters:
            c.votes = 0
            clusters_by_id[c.id_] = c
        for p in self.people:
            for v in p.votes:
                c = clusters_by_id[v]
                c.votes += 1


# TODO gc old ones
retros = {}


def get_or_create_retro(pk):
    global retros
    if pk not in retros:
        retros[pk] = Retro(pk=pk)
    return retros[pk]


def init_msg(retro: Retro):
    return {
        "type": "init",
        "state": retro.state,
        "people": [people_dict(p) for p in retro.people],
        "topics": [topic_dict(t) for t in retro.topics],
        "clusters": [cluster_dict(c) for c in retro.clusters],
        "actions": retro.actions,
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
        "id": cluster.id_,
        "topics": [t.text for t in cluster.topics],  # TODO switch to topic ids
        "votes": cluster.votes,
    }


# TODO Rewrite as async- https://channels.readthedocs.io/en/stable/tutorial/part_3.html#rewrite-the-consumer-to-be-asynchronous
class ChatConsumer(WebsocketConsumer):
    def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.person = None

        self.room_group_name = "chat_%s" % self.room_name

        async_to_sync(self.channel_layer.group_add)(
            self.room_group_name, self.channel_name
        )

        self.accept()

        retro = get_or_create_retro(self.room_name)
        self.send(text_data=json.dumps(init_msg(retro)))

    def disconnect(self, close_code):
        async_to_sync(self.channel_layer.group_discard)(
            self.room_group_name, self.channel_name
        )

    def receive(self, text_data):
        action = json.loads(text_data)
        retro = get_or_create_retro(self.room_name)

        # TODO maybe move this into connect()
        if action["type"] == "join":
            # Whether or not the retro is in the initial joining stage, add them
            # to the list of users.
            self.person = Person(name=action["name"])
            retro.people.append(self.person)
            async_to_sync(self.channel_layer.group_send)(
                self.room_group_name, {"type": "join", "name": self.person.name}
            )
            if retro.state != "joining":
                # Send init to jump there to wherever the retro is up to.
                self.send(text_data=json.dumps(init_msg(retro)))

        if retro.state == "joining":
            if action["type"] == "start":
                retro.state = "brainstorming"
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name, {"type": "send_init"}
                )
        elif retro.state == "brainstorming":
            if action["type"] == "addTopic":
                topic = Topic(text=action["text"], feeling=action["list"], x=0, y=0)
                retro.topics.append(topic)
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name,
                    {
                        "type": "add_topic",
                        "list": action["list"],
                        "text": action["text"],
                    },
                )
            elif action["type"] == "goToGrouping":
                retro.state = "grouping"
                retro.set_initial_topic_positions()
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name, {"type": "send_init"}
                )
        elif retro.state == "grouping":
            if action["type"] == "moveTopic":
                # TODO have a more efficient topic lookup
                for t in retro.topics:
                    if t.text == action["text"]:
                        t.x = action["x"]
                        t.y = action["y"]
                        break
                # Once we have a persistent datastore though, we probably won't
                # want to write every tiny little move to it (assuming we have a
                # scheme to ensure that all users in a given retro will talk to the
                # same app/web server). When we get there, we'll split this into 2
                # actions: while-being-dragged movements, of which there will be
                # many and which we will replicate to other browsers but not
                # persist to the db, and done-with-drag movements which we will.
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name,
                    {
                        "type": "move_topic",
                        "text": action["text"],
                        "x": action["x"],
                        "y": action["y"],
                    },
                )
            elif action["type"] == "goToVoting":
                next_id = 0
                for ac in action["clusters"]:
                    topics = [retro.get_topic_by_text(t) for t in ac]
                    retro.clusters.append(Cluster(id_=next_id, topics=topics))
                    next_id += 1
                retro.state = "voting"
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name, {"type": "send_init"}
                )
        elif retro.state == "voting":
            if action["type"] == "setVotes":
                self.person.votes = [int(v) for v in action["votes"]]
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name,
                    {
                        "type": "update_votes",
                    },
                )
            elif action["type"] == "goToDiscussion":
                retro.tally_votes()
                retro.state = "discussion"
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name, {"type": "send_init"}
                )
        elif retro.state == "discussion":
            if action["type"] == "addAction":
                retro.actions.append(action["text"])
                # Kind of a hack but just re-init
                async_to_sync(self.channel_layer.group_send)(
                    self.room_group_name, {"type": "send_init"}
                )

    def join(self, event):
        name = event["name"]
        self.send(text_data=json.dumps({"type": "join", "name": name}))

    def send_init(self, event):
        retro = get_or_create_retro(self.room_name)
        self.send(text_data=json.dumps(init_msg(retro)))

    def add_topic(self, event):
        list_ = event["list"]
        text = event["text"]
        self.send(
            text_data=json.dumps(
                {
                    "type": "addTopic",
                    "list": list_,
                    "text": text,
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
        retro = get_or_create_retro(self.room_name)
        self.send(
            text_data=json.dumps(
                {
                    "type": "updateVotes",
                    "people": [people_dict(p) for p in retro.people],
                }
            )
        )
