# Hack Retro

A ridiculously hacky and as-of-yet incomplete tool to facilitate team retros.

If you want something reasonable in the same vein, check out https://remoteretro.org/ :-)


# Dev

```sh
poetry install
poetry run ./manage.py migrate
poetry run ./manage.py runserver
```

Run checks. TODO put in ci.
```sh
poetry run mypy danretro/ main/
poetry run black --check danretro/ main/
# stop the build if there are Python syntax errors or undefined names
poetry run flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
# exit-zero treats all errors as warnings. The GitHub editor is 127 chars wide
poetry run flake8 . --count --exit-zero --max-complexity=10 --max-line-length=127 --statistics

yarn install
yarn run eslint static/main.js
```
