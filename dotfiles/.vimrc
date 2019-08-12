"""""""""""""""""""""""""""""""""""""""""""""""""
" I. Plugins
"""""""""""""""""""""""""""""""""""""""""""""""""

call plug#begin('~/.vim/plugged')

Plug 'airblade/vim-gitgutter'
Plug 'ctrlpvim/ctrlp.vim'
Plug 'fatih/vim-go', { 'do': ':GoUpdateBinaries' }
Plug 'godlygeek/tabular'
Plug 'nathanaelkane/vim-indent-guides'
Plug 'scrooloose/nerdtree'
Plug 'terryma/vim-multiple-cursors'
Plug 'tpope/vim-commentary'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'
Plug 'vim-airline/vim-airline'
Plug 'vim-syntastic/syntastic'
Plug 'wakatime/vim-wakatime'
Plug 'xuyuanp/nerdtree-git-plugin'

call plug#end()

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

" set statusline=col:\ %c%#warningmsg#%{SyntasticStatuslineFlag()}%*

let vim_markdown_preview_hotkey='<C-m>'
let vim_markdown_preview_github=1
let vim_markdown_preview_toggle=3

"""""""""""""""""""""""""""""""""""""""""""""""""
" III. Keybindings
"""""""""""""""""""""""""""""""""""""""""""""""""

" NerdTree shortcuts
nnoremap <Leader>f :NERDTreeToggle<Enter>
nnoremap <Leader>r :NERDTreeFind<Enter>:NERDTreeRefreshRoot<Enter>

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

" FIXME: Is this still needed?
" nnoremap <C-j><C-x> :let b:syntastic_javascript_jscs_args = "-x"

"""""""""""""""""""""""""""""""""""""""""""""""""
" IV. Linting and Syntax
"""""""""""""""""""""""""""""""""""""""""""""""""

let g:syntastic_always_populate_loc_list = 1
let g:syntastic_auto_loc_list = 2
let g:syntastic_check_on_open = 0
let g:syntastic_check_on_wq = 0
let g:syntastic_aggregate_errors = 1

let g:syntastic_style_error_symbol = "◦"
let g:syntastic_style_warning_symbol = "◦"

let g:syntastic_error_symbol = "●"
let g:syntastic_warning_symbol = "◦"

" Point syntastic checker at locally installed `eslint` if it exists.
if executable('./node_modules/.bin/eslint')
  let b:syntastic_javascript_eslint_exec = './node_modules/.bin/eslint'
endif

let g:syntastic_ruby_checkers = ["rubocop"]

" let g:syntastic_javascript_checkers = ["eslint"]
" let g:syntastic_jsx_checkers = ["eslint"]

let g:syntastic_javascript_checkers = ["jshint", "jscs"]
let g:syntastic_jsx_checkers = ["eslint"]

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
