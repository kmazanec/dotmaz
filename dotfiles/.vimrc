set background=dark
set gfn=MonacoB2:h13
" colorscheme base16-tomorrow
let &t_Co=256

" Show line numbers by default
set nu

" Toggle relative line numbers
nnoremap <Leader>l :set nu rnu!<cr>

" Show cursorline by default
set cursorline

" Toggle cursorline
nnoremap <Leader>c :set cursorline!<cr>

set foldmethod=syntax

:autocmd BufNewFile,BufRead *.ejs set syntax=jst
:autocmd BufNewFile,BufRead *.us set syntax=jst
:autocmd BufWritePre *.go :GoImports

:autocmd FileType jasmine setlocal commentstring=// %s

inoremap jk <esc>
inoremap kj <esc>

nnoremap <BS> :set hlsearch! hlsearch?<cr>
nnoremap <C-j><C-x> :let b:syntastic_javascript_jscs_args = "-x"

vnoremap < <gv
vnoremap > >gv

let g:indent_guides_enable_on_vim_startup = 1
let g:indent_guides_start_level = 2

set statusline=col:\ %c%#warningmsg#%{SyntasticStatuslineFlag()}%*

let vim_markdown_preview_hotkey='<C-m>'
let vim_markdown_preview_github=1
let vim_markdown_preview_toggle=3

" Point syntastic checker at locally installed `eslint` if it exists.
if executable('./node_modules/.bin/eslint')
  let b:syntastic_javascript_eslint_exec = './node_modules/.bin/eslint'
endif

let g:syntastic_always_populate_loc_list = 1
let g:syntastic_auto_loc_list = 2
let g:syntastic_check_on_open = 0
let g:syntastic_check_on_wq = 0
let g:syntastic_aggregate_errors = 1

let g:syntastic_style_error_symbol = "◦"
let g:syntastic_style_warning_symbol = "◦"

let g:syntastic_error_symbol = "●"
let g:syntastic_warning_symbol = "◦"

let g:syntastic_ruby_checkers = ["rubocop"]

" let g:syntastic_javascript_checkers = ["eslint"]
" let g:syntastic_jsx_checkers = ["eslint"]

let g:syntastic_javascript_checkers = ["jshint", "jscs"]
let g:syntastic_jsx_checkers = ["eslint"]
" let g:syntastic_javascript_jscs_args = "-x"

set exrc
set secure
