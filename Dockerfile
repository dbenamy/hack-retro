FROM python:3.10

RUN pip install poetry==1.3.2
ADD pyproject.toml .
ADD poetry.lock .
RUN poetry install

ADD . .
CMD poetry run python manage.py migrate && poetry run python manage.py runserver
