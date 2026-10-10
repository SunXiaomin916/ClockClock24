"""Archive a staged release, retaining macOS symlinks and executable modes on Windows."""
import hashlib
import json
import os
import stat
import sys
import time
import zipfile
from pathlib import Path

source, destination = map(Path, sys.argv[1:3])
source = source.resolve(strict=True)
assert destination.resolve().parent != source, 'Output must be outside the staging folder'
entries = []
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for root, directories, files in os.walk(source, followlinks=False):
        for name in sorted(directories + files):
            item = Path(root) / name
            relative = source.name + '/' + item.relative_to(source).as_posix()
            is_link = item.is_symlink()
            if item.is_dir() and not is_link:
                info = zipfile.ZipInfo(relative+'/', time.localtime()[:6])
                info.create_system = 3
                info.external_attr = (stat.S_IFDIR | 0o755) << 16 | 0x10
                archive.writestr(info, b'')
                continue
            data = os.readlink(item).replace('\\','/').encode('utf-8') if is_link else item.read_bytes()
            magic = data[:4]
            executable = item.suffix in ('.command','.sh') or magic in (b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xca\xfe\xba\xbe',b'\xbe\xba\xfe\xca')
            mode = stat.S_IFLNK | 0o777 if is_link else stat.S_IFREG | (0o755 if executable else 0o644)
            info = zipfile.ZipInfo(relative, time.localtime()[:6]);info.create_system=3;info.external_attr=mode<<16;info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,data)
            entries.append({'path':relative,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'symlink':is_link,'mode':oct(mode)})
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None, 'Archive CRC validation failed'
    for entry in entries:
        assert hashlib.sha256(archive.read(entry['path'])).hexdigest()==entry['sha256'], entry['path']
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.sha256').write_text(f'{digest}  {destination.name}\n',encoding='utf-8')
destination.with_suffix('.manifest.json').write_text(json.dumps({'archive':destination.name,'sha256':digest,'files':entries},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'archive':str(destination),'files':len(entries),'symlinks':sum(e['symlink'] for e in entries),'bytes':destination.stat().st_size,'sha256':digest}))
