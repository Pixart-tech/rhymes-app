# UNC Path Troubleshooting

When working with Windows network shares (UNC paths such as
`\\\\pixartnas\\home\\Project ABC`), there are a couple of details to keep in
mind to make Python path checks reliable.

## Why `Path.exists()` may return `False`

`pathlib.Path.exists()` uses the underlying operating system API. On Windows,
UNC paths rely on network availability and permissions. If the share is slow to
respond, requires credentials, or the application is running under a context
without access (e.g. a service account), ``Path.exists()`` can legitimately
return ``False`` even though the folder is visible from File Explorer. Another
common culprit is stale network connections—Windows caches network resources
and a transient failure can cause the first API call to report ``ERROR_BAD_NETNAME``.

In addition, some Python builds compiled against older versions of the Windows
SDK had bugs resolving UNC paths when the share name included spaces or mixed
case characters. `os.path.exists()` and `Path.exists()` both call into the same
Win32 ``GetFileAttributes`` function, but retrying with `os.path.exists()` can
sometimes succeed because it performs slightly different path normalisation on
the string first.

## Recommended approach

1. Build paths with `pathlib.PureWindowsPath` to ensure that backslashes are
   treated literally—this prevents unexpected escape sequences (for example
   `\T` or `\C`).
2. Use raw string literals when defining UNC roots in code: `r"\\\\server\\share"`.
3. Check existence with both `Path.exists()` and `os.path.exists()` while
   printing out the parent directory. This highlights permission or connectivity
   issues quickly. See [`backend/app/unc_path_utils.py`](../backend/app/unc_path_utils.py)
   for a ready-made helper that implements this diagnostic behaviour.
4. If both calls fail but the folder is known to exist, attempt to access the
   path through `os.listdir` or `pathlib.Path.iterdir()` inside a retry loop—this
   often succeeds after the network connection warms up.

In production code the most reliable pattern is to wrap the existence check in a
small retry with exponential backoff and to surface meaningful debug logs when a
share cannot be reached.

