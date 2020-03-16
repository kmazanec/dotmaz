"""""""""""""""""""""""""""""""""""""""""""""""""
" I. Plugins
"""""""""""""""""""""""""""""""""""""""""""""""""

call plug#begin('~/.vim/plugged')

Plug 'airblade/vim-gitgutter'
Plug 'ctrlpvim/ctrlp.vim'
Plug 'editorconfig/editorconfig-vim'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'godlygeek/tabular'
Plug 'mileszs/ack.vim'
Plug 'nathanaelkane/vim-indent-guides'
Plug 'nikvdp/ejs-syntax'
Plug 'ntpeters/vim-better-whitespace'
Plug 'othree/html5.vim'
Plug 'othree/xml.vim'
Plug 'pangloss/vim-javascript'
Plug 'scrooloose/nerdtree'
Plug 'terryma/vim-multiple-cursors'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-projectionist'
Plug 'tpope/vim-sleuth'
Plug 'tpope/vim-surround'
Plug 'vim-airline/vim-airline'
Plug 'vim-scripts/a.vim'
Plug 'vim-syntastic/syntastic'
Plug 'wakatime/vim-wakatime'
Plug 'xuyuanp/nerdtree-git-plugin'

call plug#end()

" Tell Ack.vim to use Ag under the hood instead
if executable('ag')
  let g:ackprg = 'ag --vimgrep'
endif

" Prevent fights between editor config and fugitive
let g:EditorConfig_exclude_patterns = ['fugitive://.\*']

"""""""""""""""""""""""""""""""""""""""""""""""""
" II. Look and Feel
"""""""""""""""""""""""""""""""""""""""""""""""""

set background=dark
set gfn=Monaco:h12
colorscheme darkblue

" Show line numbers by default
set nu

" Show cursorline by default
set cursorline

set foldmethod=syntax

" NerdTree customization

let NERDTreeMinimalUI = 1
let NERDTreeDirArrows = 1
let NERDTreeQuitOnOpen = 1

let g:NERDTreeIndicatorMapCustom = {
	\ "Modified"  : "✹",
	\ "Staged"    : "✚",
	\ "Untracked" : "✭",
	\ "Renamed"   : "➜",
	\ "Unmerged"  : "═",
	\ "Deleted"   : "✖",
	\ "Dirty"     : "✗",
	\ "Clean"     : "✔︎",
	\ 'Ignored'   : '☒',
	\ "Unknown"   : "?"
	\ }

let g:indent_guides_enable_on_vim_startup = 1
let g:indent_guides_start_level = 2

let vim_markdown_preview_hotkey='<C-m>'
let vim_markdown_preview_github=1
let vim_markdown_preview_toggle=3

"""""""""""""""""""""""""""""""""""""""""""""""""
" III. Keybindings
"""""""""""""""""""""""""""""""""""""""""""""""""

" NerdTree shortcuts
nnoremap <Leader>f :NERDTreeToggle<Enter>
nnoremap <Leader>r :NERDTreeFind<Enter>:NERDTreeRefreshRoot<Enter>

" Terminal shortcut
nnoremap <Leader>t :terminal<Enter>source ~/.bash_profile<Enter>

" Search shortcut
nnoremap <Leader>a :Ack!<space>

" Show register contents
nnoremap <Leader>q :reg<Enter>

" Toggle relative line numbers
nnoremap <Leader>l :set nu rnu!<cr>

" Toggle cursorline
nnoremap <Leader>c :set cursorline!<cr>

" For keyboards that don't have an easy escape key
inoremap jk <esc>
inoremap kj <esc>

" Toggle highlighting search results
nnoremap <BS> :set hlsearch! hlsearch?<cr>

" For easier indenting and un-indenting
vnoremap < <gv
vnoremap > >gv

" Window resizing horizontal
nnoremap <M-=> :resize +4<CR>
nnoremap <M--> :resize -4<CR>

" Window resizing vertical
nnoremap <M-[> :vertical resize +4<CR>
nnoremap <M-]> :vertical resize -4<CR>

" Helpers for making gf more useful
set path+=app/**
set suffixesadd+=.jst.ejs

" Allow MacVim to use the meta/alt key on mac
set macmeta

" TouchBar
amenu TouchBar.📂 :NERDTreeToggle<Enter>
amenu TouchBar.🔎 :Ack!<Space>
amenu TouchBar.📋 :reg<Enter>
amenu TouchBar.🦞 :Commentary<Enter>

" FIXME: Is this still needed?
" nnoremap <C-j><C-x> :let b:syntastic_javascript_jscs_args = "-x"

"""""""""""""""""""""""""""""""""""""""""""""""""
" IV. Linting and Syntax
"""""""""""""""""""""""""""""""""""""""""""""""""

" Strip whitespace on save
let g:strip_whitespace_on_save = 1
let g:strip_whitespace_confirm = 0

" Ignore files that are too large
let g:strip_max_file_size = 1000

" Ignore some directories from CtrlP fuzzy searching
let g:ctrlp_custom_ignore = "node_modules"

" Syntastic customization
let g:syntastic_always_populate_loc_list = 1
let g:syntastic_auto_loc_list = 2
let g:syntastic_check_on_open = 0
let g:syntastic_check_on_wq = 0
let g:syntastic_aggregate_errors = 1

let g:syntastic_style_error_symbol = "●"
let g:syntastic_style_warning_symbol = "●"

let g:syntastic_error_symbol = "●"
let g:syntastic_warning_symbol = "◦"

highlight SyntasticErrorSign guifg=red guibg=bg
highlight SyntasticWarningSign guifg=yellow guibg=bg

" Point syntastic checker at locally installed `eslint` if it exists.
if executable('./node_modules/.bin/eslint')
  let b:syntastic_javascript_eslint_exec = './node_modules/.bin/eslint'
endif

" Point syntastic checker at locally installed `jscs` if it exists.
if executable('./node_modules/.bin/jscs')
  let b:syntastic_javascript_jscs_exec = './node_modules/.bin/jscs'
endif

let g:syntastic_ruby_checkers = ["mri", "rubocop"]

" let g:syntastic_javascript_checkers = ["eslint"]
" let g:syntastic_jsx_checkers = ["eslint"]

let g:syntastic_javascript_checkers = ["jscs"]
let g:syntastic_jsx_checkers = ["eslint"]

let g:syntastic_css_checkers = ["sass", "stylelint", "scss_lint"]
let g:syntastic_scss_checkers = ["sass", "stylelint", "scss_lint"]

" Map alternate file types to correct syntax
:autocmd BufNewFile,BufRead *.ejs set syntax=jst
:autocmd BufNewFile,BufRead *.us set syntax=jst

" Run go imports on save
:autocmd BufWritePre *.go :GoImports

" Refresh git gutter on write
:autocmd BufWritePost * :GitGutter

" Set the correct comment string for jasmine
:autocmd FileType jasmine setlocal commentstring=// %s

set exrc
set secure
