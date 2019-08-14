#! /bin/bash

echo "Setting up Brad's Deals environment"

if [[ -z $HOMEBREW_GITHUB_API_TOKEN ]]; then
  echo "  ⚠️  Please set HOMEBREW_GITHUB_API_TOKEN to continue"
  echo "     More info: https://github.com/shopsmart/homebrew-bd"
  exit 1
fi

# Run BD-specific setup
brew tap git@github.com:shopsmart/homebrew-bd.git
brew install bd

# Dependency for WWW local dev
brew install zeromq

# Base AWS Config
mkdir -p ~/.aws

CONFIG_FILE=~/.aws/config
if [[ -f $CONFIG_FILE ]]; then
  echo "$CONFIG_FILE exists, skipping"
else
  echo -e "[default]\nregion = us-east-1" > $CONFIG_FILE
fi

CONFIG_FILE=~/.aws/credentials
if [[ -f $CONFIG_FILE ]]; then
  echo "$CONFIG_FILE exists, skipping"
else
  echo -e "[default]\naws_access_key_id = [REPLACE]\naws_secret_access_key = [REPLACE]" > $CONFIG_FILE
  echo "Be sure to update $CONFIG_FILE with your key and secret"
fi

echo "Setting up dev resources"

mkdir -p ~/dev
cd ~/dev
git clone git@github.com:shopsmart/toolshed.git

git clone git@github.com:shopsmart/alexa-skill.git
git clone git@github.com:shopsmart/bd.git
git clone git@github.com:shopsmart/bd_black_friday_admin.git
git clone git@github.com:shopsmart/bd_content_hub.git
git clone git@github.com:shopsmart/bd_lint.git
git clone git@github.com:shopsmart/bd_paid_placements.git
git clone git@github.com:shopsmart/bd_rails4.git
git clone git@github.com:shopsmart/bd_resize_service.git
git clone git@github.com:shopsmart/buypass_api.git
git clone git@github.com:shopsmart/buypass_web.git
git clone git@github.com:shopsmart/channels.git
git clone git@github.com:shopsmart/contests.git
git clone git@github.com:shopsmart/credit_feed.git
git clone git@github.com:shopsmart/discussions.git
git clone git@github.com:shopsmart/engagement_service.git
git clone git@github.com:shopsmart/feedbuilder.git
git clone git@github.com:shopsmart/feeds_admin.git
git clone git@github.com:shopsmart/glogg.git
git clone git@github.com:shopsmart/imageredirect.git
git clone git@github.com:shopsmart/lambda-functions.git
git clone git@github.com:shopsmart/messages.git
git clone git@github.com:shopsmart/popularity-revamp.git
git clone git@github.com:shopsmart/prospects-api.git
git clone git@github.com:shopsmart/shopsmartidentityserver.git
git clone git@github.com:shopsmart/shopsmartredirector.git
git clone git@github.com:shopsmart/sitemap-generator.git
git clone git@github.com:shopsmart/subscriptions.git
git clone git@github.com:shopsmart/tracker.git
git clone git@github.com:shopsmart/user_services.git
git clone git@github.com:shopsmart/wwwproxy.git

echo "Running toolshed setup script"
. ./toolshed/setup/files/bd_setup.sh

echo "Please install Docker for mac: https://hub.docker.com/editions/community/docker-ce-desktop-mac"
echo "  then continue setup here: https://github.com/shopsmart/toolshed/wiki/Developer-Docker-Setup"
