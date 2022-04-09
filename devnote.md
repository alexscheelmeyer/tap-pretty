To create new testcases remember to use `FORCE_COLOR=` to make sure colorette outputs the colorcoding so
it can be verified. Example:

```
cat tests/fixtures/failure.tap | FORCE_COLOR= ./bin/tap-pretty > tests/expectations/failure.txt
```
