if [ -f ~/.git-completion.bash ]; then
  . ~/.git-completion.bash
fi

if [ -f ~/.git-prompt.sh ]; then
  . ~/.git-prompt.sh
fi

source /usr/local/opt/chruby/share/chruby/chruby.sh
source /usr/local/opt/chruby/share/chruby/auto.sh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

enter_directory() {
  if [[ $PWD == $PREV_PWD ]]; then
    return
  fi

  PREV_PWD=$PWD
  [[ -f ".nvmrc" ]] && nvm use
}

export BUNDLER_EDITOR="mvim"


# === GENERAL ALIASES === #

alias ls='ls -FGh'
alias ll='ls -lFGh'

alias bashp='vi ~/.bash_profile'
alias dotmaz='cd ~/keith/dotmaz'
alias be="bundle exec "
alias ba="./bin/app"

alias getip='dig +short myip.opendns.com @resolver1.opendns.com'


# === GIT ALIASES === #

alias gst='git status '
alias ga='git add '
alias gb='git branch '
alias gc='git commit'
alias gd='git diff'
alias gds='git diff --staged'
alias gco='git checkout '
alias gk='gitk --all&'
alias gx='gitx --all'
alias gp='git push '
alias gpu='git push origin HEAD -u'
alias gap='git add -p'
alias gt='git log --oneline --graph --color --all --decorate'


# === COLORS === #

BLUE="\e[0;34m"
DARK_BLUE="\e[1;34m"
RED="\e[0;31m"
DARK_RED="\e[1;31m"
YELLOW="\e[0;33m"
GREEN="\e[0;32m"
DARK_GREEN="\e[1;32m"
GRAY="\e[1;30m"
LIGHT_GRAY="\e[0;37m"
CYAN="\e[0;36m"
LIGHT_CYAN="\e[1;36m"
# NO_COLOR="\033[0m"
NO_COLOR="\e[m"


# === GIT PS1 HELPERS === #

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
    git_symbol="◉"
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

function set_prompt {
  set_git_color
  set_window_title "${PWD##*/}"
  enter_directory
  PS1="\[$GRAY\]\d \t \[$NO_COLOR\]\w \[$CYAN\]\$(__git_ps1 '(%s)') \[$git_color\]$git_symbol\[$NO_COLOR\]\n\[$DARK_GREEN\]=>\[$NO_COLOR\] "
}

PROMPT_COMMAND=set_prompt

# PS1="\[$DARK_GREEN\]\u\[$NO_COLOR\]: \W/\[\$(echo -e \${git_color})\] \${git_symbol}\[$DARK_BLUE\]\$(parse_git_branch)\[$NO_COLOR\] 💰  "
# PS1="\[$GRAY\]\d \t \[$NO_COLOR\]\w \[$CYAN\]\$(__git_ps1 '(%s)') \[\$(echo -e \${git_color})\]\${git_symbol}\[$NO_COLOR\]\n\[$DARK_GREEN\]=>\[$NO_COLOR\] "

# === PATH SETUP === #

# export GOBIN="$HOME/dev/go/bin"
# export GOPATH="$HOME/dev/go"
# export PATH="$HOME/dev/javascript/depot_tools:$PATH"
# export PATH="$HOME/dev/go/bin:$PATH"
# export PATH="/usr/local/bin:$PATH"
# export PATH="/usr/local/go/bin:$PATH"
# export PATH="/usr/local/opt/go/libexec/bin:$PATH"
# export PATH="/usr/local/opt/qt@5.5/bin:$PATH"
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
export PATH="$HOME/.yarn/bin:$HOME/.config/yarn/global/node_modules/.bin:$PATH"

# Setting PATH for Python 3.4
# The orginal version is saved in .bash_profile.pysave
# PATH="/Library/Frameworks/Python.framework/Versions/3.4/bin:${PATH}"
# export PATH

# === BRADS DEALS HELPERS === #

export NGINX_DOCKER_HOME="$HOME/dev/toolshed/docker"
export TOOLSHED_HOME="$HOME/dev/toolshed"

function bds () {
  local dir=""
  case $1 in
    www | bd_rai*) dir='bd_rails4' ;;
    user*) dir='user_services' ;;
    content* | bd_cont*) dir='bd_content_hub' ;;
    subscrip*) dir='subscriptions' ;;
    prospect* | axis | portal) dir='prospects-api' ;;
    *redirect*) dir='shopsmartredirector' ;;
    placement* | bd_paid*) dir='bd_paid_placements' ;;
    feedbu*) dir='feedbuilder' ;;
    credit*) dir='credit_feed' ;;
    engagement*) dir='engagement_service' ;;
    discussion*) dir='discussions' ;;
    cms | feeds*) dir='feeds_admin' ;;
    image* | bd_res*) dir='bd_resize_service' ;;
    buypass*api | bpapi) dir='buypass_api' ;;
    buypass*web | bpweb) dir='buypass_web' ;;
    bf | blackfriday) dir='bd_black_friday_admin' ;;
    channel*) dir='channels' ;;
    scratch | s*) dir='scratch' ;;
    *)
      [[ ! -z "$1" ]] && echo "Unrecognized app name: $1"
      echo "Options:"
      echo " ◦ axis"
      echo " ◦ blackfriday_admin (bf)"
      echo " ◦ buypass-api (bpapi)"
      echo " ◦ buypass-web (bpweb)"
      echo " ◦ channels"
      echo " ◦ cms"
      echo " ◦ content"
      echo " ◦ credit"
      echo " ◦ discussions"
      echo " ◦ engagements"
      echo " ◦ feedbuilder"
      echo " ◦ image_resize"
      echo " ◦ placements"
      echo " ◦ redirector"
      echo " ◦ scratch"
      echo " ◦ subscriptions"
      echo " ◦ users"
      echo " ◦ www"
      ;;
  esac

  if [[ ! -z "$dir" ]]; then
    cd ~/dev/$dir
    echo "Changing to: `pwd`"
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

# ===  Load .local overrides last === #

[ ! -f "$HOME/.bashrc.local" ] || . "$HOME/.bashrc.local"
[ ! -f "$HOME/.bash_profile.local" ] || . "$HOME/.bash_profile.local"

