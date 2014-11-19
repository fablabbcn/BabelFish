# Bugs

- compilerflasher is overriden by the object compilerflasher, thus you
can t make any new ones and the name compilerflasher.
-  The above also means we need to bind `this`.

# Fixes

- Getports are async
