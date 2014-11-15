if [ -f ~/.git-completion.bash ]; then
  . ~/.git-completion.bash
fi


function parse_git_branch () {
       git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
}


alias gst='git status '
alias ga='git add '
alias gb='git branch '
alias gc='git commit'
alias gd='git diff'
alias gco='git checkout '
alias gk='gitk --all&'
alias gx='gitx --all'
alias gp='git push '
alias gap='git add -p'

alias gt='git log --oneline --graph --color --all --decorate'

alias ls='ls -FGh'
alias ll='ls -lFGh'

alias bashp='subl ~/.bash_profile'

alias bd="cd ~/dev/bd_rails4"


alias getip='dig +short myip.opendns.com @resolver1.opendns.com'


BLUE="\[\033[0;34m\]"
DARK_BLUE="\[\033[1;34m\]"
RED="\[\033[0;31m\]"
DARK_RED="\[\033[1;31m\]"
YELLOW="\[\033[0;33m\]"
GREEN="\[\033[0;32m\]"
DARK_GREEN="\[\033[1;32m\]"
GRAY="\[\033[1;30m\]"
LIGHT_GRAY="\[\033[0;37m\]"
CYAN="\[\033[0;36m\]"
LIGHT_CYAN="\[\033[1;36m\]"
NO_COLOUR="\[\033[0m\]"


PS1="$GREEN\u$NO_COLOUR: /\W$CYAN\$(parse_git_branch)$NO_COLOUR \$ "

[[ -s "$HOME/.rvm/scripts/rvm" ]] && source "$HOME/.rvm/scripts/rvm" # Load RVM into a shell session *as a function*


export GOPATH="$HOME/dev/go"
export PATH="$HOME/dev/go/bin:$PATH"
export PATH="/usr/local/bin:$PATH"

read -d '' Lobster <<"EOF"
.                               ,.---.
                      ,,,,     /    _ `.
                       \\\\\\\\   /      \\  )
                        |||| /\\/``-.__\\/
                        ::::/\\/_
        {{`-.__.-'(`(^^(^^^(^ 9 `.========='
       {{{{{{ { ( ( (  (   (-----:=
        {{.-'~~'-.(,(,,(,,,(__6_.'=========.
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
alias rspec=myrspec
alias cucumber=mycucumber
alias rake=myrake


function users_local () {
  echo "User services? Good call, run it locally..."
  cd ~/dev/user_services
  git pull
  rails s -p 3001
}
