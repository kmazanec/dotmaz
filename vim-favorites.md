# Favorite Vim shortcuts

## Format XML

Best used from visual mode with a chunk of text highighted.

```
! xmllint --format -
```

## Change wrapping element

Comes from vim-surround plugin. Cursor should be between the surrounding elements.

(foo) -> [foo]

```
c + s + ) + ]
```

<div>Foo</div> -> <span>Foo</span>

```
c + s + t + t + span
```

"hello" -> 'hello'

```
c + s + " + '
```
