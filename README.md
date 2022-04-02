# tap-pretty
Yet another TAP output formatter. I made this because I got annoyed that all the other
TAP formatters I could find were having security issues as reported by `npm audit`. It also
turns out that most do not cover much of the TAP protocol anyway, so hopefully this will
in time cover more.

List of features known to not be supported at this time:

  - _Buffered_ subtests, unbuffered is supported though.
  - The `time` clause for subtests. It is just shown as regular text right now.


