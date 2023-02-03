from random import randint
from uuid import uuid4

from django.db import models


# Keep these values in sync with the values in the html
GROUPING_WORKSPACE_HEIGHT = 800
GROUPING_WORKSPACE_WIDTH = 1400


class Retro(models.Model):
    uuid = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    state = models.CharField(max_length=20, default="joining")

    def set_initial_topic_positions(self):
        for t in self.topics.all():
            # TODO prevent overlap with the edge of the workspace
            t.x = randint(0, GROUPING_WORKSPACE_WIDTH)
            t.y = randint(0, GROUPING_WORKSPACE_HEIGHT)
            t.save()

    def tally_votes_and_save(self) -> None:
        clusters_by_id = {}
        for c in self.clusters.all():
            c.votes = 0
            clusters_by_id[c.pk] = c
        for p in self.people.all():
            for v in p.votes:
                c = clusters_by_id[v]
                c.votes += 1
        for c in clusters_by_id.values():
            c.save()


class Person(models.Model):
    retro = models.ForeignKey(Retro, on_delete=models.PROTECT, related_name="people")
    name = models.CharField(max_length=200)
    votes = models.JSONField(default=list)  # list of up to 3 cluster ids


class Cluster(models.Model):
    retro = models.ForeignKey(Retro, on_delete=models.PROTECT, related_name="clusters")
    votes = models.IntegerField(default=0)


class Topic(models.Model):
    retro = models.ForeignKey(Retro, on_delete=models.PROTECT, related_name="topics")
    cluster = models.ForeignKey(
        Cluster, on_delete=models.PROTECT, blank=True, null=True, related_name="topics"
    )
    text = models.CharField(max_length=200)
    feeling = models.CharField(max_length=10)  # happy, sad, or confused
    x = models.IntegerField(default=0)
    y = models.IntegerField(default=0)


class ActionItem(models.Model):
    retro = models.ForeignKey(
        Retro, on_delete=models.PROTECT, related_name="action_items"
    )
    text = models.CharField(max_length=500)
