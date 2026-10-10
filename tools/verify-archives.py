"""Check macOS links/modes and release sidecars without needing a Mac host."""
import hashlib
import json
import posixpath
import stat
import zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
for file in sorted((root/'release').glob('*.zip')):
    manifest=json.loads(file.with_suffix('.manifest.json').read_text(encoding='utf-8'))
    assert hashlib.sha256(file.read_bytes()).hexdigest()==manifest['sha256'], file.name
    with zipfile.ZipFile(file) as z:
        names=set(z.namelist())
        def resolve_link(target, visited=()):
            assert target not in visited, 'Symlink cycle: '+target
            parts=target.split('/')
            for count in range(1,len(parts)+1):
                prefix='/'.join(parts[:count])
                if prefix in names and stat.S_ISLNK(z.getinfo(prefix).external_attr>>16):
                    linked=posixpath.normpath(posixpath.join(posixpath.dirname(prefix),z.read(prefix).decode(),*parts[count:]))
                    assert linked.startswith(parts[0]+'/'), linked
                    return resolve_link(linked,(*visited,target))
            return target
        assert z.testzip() is None, file.name
        for entry in manifest['files']:
            data=z.read(entry['path'])
            assert hashlib.sha256(data).hexdigest()==entry['sha256'], entry['path']
            info=z.getinfo(entry['path']);mode=info.external_attr>>16
            if stat.S_ISLNK(mode):
                target=posixpath.normpath(posixpath.join(posixpath.dirname(info.filename),data.decode()))
                assert target.startswith(info.filename.split('/')[0]+'/'), target
                resolved=resolve_link(target)
                assert resolved in names or resolved+'/' in names, resolved
            if info.filename.endswith('.command') or '/Contents/MacOS/' in info.filename:
                assert mode & 0o111, info.filename
        if 'macOS' in file.name:
            assert sum(stat.S_ISLNK(i.external_attr>>16) for i in z.infolist())>=10
            assert any(i.filename.endswith('安装到应用程序.command') for i in z.infolist())
        if 'WallpaperEngine' in file.name:
            assert 'WallpaperEngine/ClockClock24/project.json' in names
            assert not any('/node_modules/' in n or '/tests/' in n or '/desktop/' in n or n.endswith('.exe') for n in names)
    print('PASS',file.name,'SHA-256 / CRC / entries / permissions / links')
