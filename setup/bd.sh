#! /bin/bash

echo "Setting up Brad's Deals environment"

if [[ -z $HOMEBREW_GITHUB_API_TOKEN ]]; then
  echo "  ⚠️  Please set HOMEBREW_GITHUB_API_TOKEN to continue"
  echo "     More info: https://github.com/shopsmart/homebrew-bd"
  exit 1
fi

# Run BD-specific setup
brew tap shopsmart/bd git@github.com:shopsmart/homebrew-bd.git
brew install bd

# Base AWS Config
mkdir ~/.aws

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
