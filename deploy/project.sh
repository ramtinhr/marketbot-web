#!/usr/bin/env bash
project=marketbot-web
legacy_container=marketbot-web
services=('web' 'backoffice')
image_vars=('MARKETBOT_WEB_IMAGE' 'MARKETBOT_BACKOFFICE_IMAGE')
dockerfiles=('Dockerfile' 'Dockerfile')
image_suffixes=('' '-backoffice')
sidecars=()
