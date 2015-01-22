if [ -f ~/.git-completion.bash ]; then
  . ~/.git-completion.bash
fi

[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm" # Load RVM into a shell session *as a function*


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
alias bd="cd ~/dev/bd_rails4"

alias getip='dig +short myip.opendns.com @resolver1.opendns.com'

alias ark='ino build && ino upload'  # Arduino SDK on mac


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

function parse_git_branch () {
  git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
}

function git_color {
  local git_status="$(git status 2> /dev/null)"

  if [[ $git_status == "" ]]; then
    echo ""
  elif [[ $git_status =~ "Changes to be committed" ]]; then
    echo -e "$YELLOW ⎈"
  elif [[ ! $git_status =~ "working directory clean" ]]; then
    echo -e "$RED ☢"
  elif [[ $git_status =~ "Your branch is ahead of" || $git_status =~ "have diverged" ]]; then
    echo -e "$BLUE ☛"
  elif [[ $git_status =~ "nothing to commit" ]]; then
    echo -e "$GREEN ✓"
  else
    echo -e "$CYAN"
  fi
}


PS1="\[$GREEN\]\u\[$NO_COLOUR\]: \W/\$(git_color)\[$CYAN\]\$(parse_git_branch)\[$NO_COLOUR\] 💰  "




# === PATH SETUP === #

export GOPATH="$HOME/dev/go"
export PATH="$HOME/dev/go/bin:$PATH"
export PATH="/usr/local/bin:$PATH"

# Setting PATH for Python 3.4
# The orginal version is saved in .bash_profile.pysave
PATH="/Library/Frameworks/Python.framework/Versions/3.4/bin:${PATH}"
export PATH


export DOCKER_CERT_PATH=/Users/kmaz/.boot2docker/certs/boot2docker-vm
export DOCKER_TLS_VERIFY=1
export DOCKER_HOST=tcp://192.168.59.103:2376


# === BRADS DEALS HELPERS === #

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
  echo " -> redis & mysql running? you might need that..."
  start_mysql
  launchctl load ~/Library/LaunchAgents/homebrew.mxcl.redis.plist
  echo " -> attempting to run any fresh migrations"
  rake db:migrate
  echo " -> starting a server on port 3001..."
  rails s -p 3001
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



