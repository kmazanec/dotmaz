if [ -f ~/.git-completion.bash ]; then
  . ~/.git-completion.bash
fi

source /usr/local/opt/chruby/share/chruby/chruby.sh
source /usr/local/opt/chruby/share/chruby/auto.sh

# [[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm" # Load RVM into a shell session *as a function*

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm

enter_directory() {
  if [[ $PWD == $PREV_PWD ]]; then
    return
  fi

  PREV_PWD=$PWD
  [[ -f ".nvmrc" ]] && nvm use
}

export BUNDLER_EDITOR="mvim"


# === COLORS === #

BLUE="\033[0;34m"
DARK_BLUE="\033[1;34m"
RED="\033[0;31m"
DARK_RED="\033[1;31m"
YELLOW="\033[0;33m"
GREEN="\033[0;32m"
DARK_GREEN="\033[1;32m"
GRAY="\033[1;30m"
LIGHT_GRAY="\033[0;37m"
CYAN="\033[0;36m"
LIGHT_CYAN="\033[1;36m"
NO_COLOUR="\033[0m"


# === GENERAL ALIASES === #

alias ls='ls -FGh'
alias ll='ls -lFGh'

alias bashp='vi ~/.bash_profile'
alias dotmaz='cd ~/dev/dotfiles/dotmaz'
alias sicp='racket -i -p neil/sicp -l xrepl'
alias be="bundle exec "
alias ba="./bin/app"

alias getip='dig +short myip.opendns.com @resolver1.opendns.com'

alias ark='ino build && ino upload'  # Arduino SDK on mac

alias slackmojify="mogrify -resize 128x128 -unsharp 2x1.4+0.5+0 -quality 100 -verbose"


# === GIT ALIASES === #

alias gst='git status '
alias ga='git add '
alias gb='git branch '
alias gc='git commit'
alias gd='git diff'
alias gco='git checkout '
alias gk='gitk --all&'
alias gx='gitx --all'
alias gp='git push '
alias gpu='git push origin HEAD -u'
alias gap='git add -p'
alias gt='git log --oneline --graph --color --all --decorate'


# === GIT PS1 HELPERS === #

function set_prompt {
  set_git_color
  set_window_title "${PWD##*/}"
  enter_directory
}

function parse_git_branch {
  git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
}

function set_git_color {
  local git_status="$(git status 2> /dev/null)"

  if [[ $git_status == "" ]]; then
    git_color=""
    git_symbol=""
  elif [[ $git_status =~ "Changes to be committed" ]]; then
    git_color="$YELLOW"
    git_symbol="⎈"
  elif [[ ! $git_status =~ "working tree clean" ]]; then
    git_color="$RED"
    git_symbol="☢"
  elif [[ $git_status =~ "Your branch is ahead of" || $git_status =~ "have diverged" ]]; then
    git_color="$BLUE"
    git_symbol="☛"
  elif [[ $git_status =~ "nothing to commit" ]]; then
    git_color="$GREEN"
    git_symbol="✓"
  else
    git_color="$CYAN"
    git_symbol=""
  fi

  export git_color
  export git_symbol
}

function set_window_title {
  case $TERM in
    *xterm*|ansi)
    echo -n -e "\033]0;$*\007"
    ;;
  esac
}

PROMPT_COMMAND=set_prompt

PS1="\[$DARK_GREEN\]\u\[$NO_COLOUR\]: \W/\[\$(echo -e \${git_color})\] \${git_symbol}\[$DARK_BLUE\]\$(parse_git_branch)\[$NO_COLOUR\] 💰  "



# === PATH SETUP === #

export GOBIN="$HOME/dev/go/bin"
export GOPATH="$HOME/dev/go"
export PATH="$HOME/dev/javascript/depot_tools:$PATH"
export PATH="$HOME/dev/go/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
export PATH="/usr/local/go/bin:$PATH"
export PATH="/usr/local/opt/go/libexec/bin:$PATH"
export PATH="/Applications/Racket_v6.1.1/bin:$PATH"
export PATH="/usr/local/opt/qt@5.5/bin:$PATH"

# Setting PATH for Python 3.4
# The orginal version is saved in .bash_profile.pysave
PATH="/Library/Frameworks/Python.framework/Versions/3.4/bin:${PATH}"
export PATH

# === BRADS DEALS HELPERS === #

export NGINX_DOCKER_HOME="$HOME/dev/toolshed/docker"

start_mysql() {
  UP=$(pgrep mysql | wc -l);
  if [ "$UP" -ne 1 ];
  then
    echo " -> starting MySQL";
    mysql.server start
  else
    echo " -> MySQL still running";
  fi
}

alias us=users_local
function users_local () {
  echo "User services? Good call, run it locally..."
  cd ~/dev/user_services
  echo " -> fetching the latest rantings of the drunken observer"
  git pull
  echo " -> redis running? you might need that..."
  launchctl load ~/Library/LaunchAgents/homebrew.mxcl.redis.plist
  echo " -> attempting to run any fresh migrations"
  bundle exec rake db:migrate
  echo " -> starting a server on port 3001..."
  bundle exec rails s -p 3001
}

function bds () {
  if [ "$1" == "bf" ]; then
    be rails s -p 3004
  elif [ "$1" == "content" ]; then
    be rails s -p 3002
  elif [ "$1" == "credit" ]; then
    be rails s -p 3009
  elif [ "$1" == "et_proxy" ]; then
    foreman start
  elif [ "$1" == "discussions" ]; then
    be rails s -p 3007
  elif [ "$1" == "engagements" ]; then
    RAILS_ENV=development be unicorn -c config/unicorn.rb -p 3010
  elif [ "$1" == "placements" ]; then
    be rails s -p 3005
  elif [ "$1" == "users" ]; then
    users_local
  elif [ "$1" == "www" ]; then
    be rails s -b 0.0.0.0
  elif [ "$1" == "feedbuilder" ]; then
    go run feedbuilder.go
  elif [ "$1" == "cms" ]; then
    npm start
  elif [ "$1" == "image_resize" ]; then
    be rackup
  else
    echo "Unrecognized app name: $1"
    echo "Options:"
    echo " - www (3000)"
    echo " - users (3001)"
    echo " - content (3002)"
    echo " - bf (3004)"
    echo " - placements (3005)"
    echo " - discussions (3007)"
    echo " - et_proxy (3008)"
    echo " - credit (3009)"
    echo " - engagements (3010)"
    echo " - feedbuilder (8080)"
    echo " - cms (8000)"
    echo " - image_resize (9292)"
  fi
}


# ===  EASTER EGGS === #

read -d '' Lobster <<"EOF"
`                               ,.---.
                      ,,,,     /    _ `.
                       \\\\\\\\   /      \\  )
                        |||| /\\/``-.__\\/
                        ::::/\\/_
      {{`-.__.-'(`(`(^^(^^^(^ 9 `.========='
     {{{{{{ { ( ( ( (  (   (-----:=
      {{.-'~~'-.(,(,(,,(,,,(__6_.'=========.
                        ::::\\/\\
                        |||| \\/\\  ,-'/\\
                       ////   \\ `` _/  )
                      ''''     \\  `   /
                                `---''

EOF

alias lobster='echo $(tput setaf 1)"${Lobster}"'

myrspec() {
  rspec $1 && unicornleap
}
mycucumber() {
  cucumber $1 && unicornleap
}
myrake() {
  rake $1 && unicornleap
}
# alias rspec=myrspec
# alias cucumber=mycucumber
# alias rake=myrake

[ ! -f "$HOME/.bashrc.local" ] || . "$HOME/.bashrc.local"

