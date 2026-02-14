import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-15

// Retro Boot Sequence
// Vintage computer boot-ups, UI tours, and “software archaeology” with CRT-ish overlays.

function roundRect(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeScanPattern(){
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0,0,4,4);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0,1,4,1);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0,3,4,1);
  return c;
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function hash32(x){
  x |= 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

function hash01(x){
  return hash32(x) / 4294967296;
}

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

function makeBootLines(rand){
  const mem = 256 + (((rand()*32)|0) * 32);
  const hdd = pick(rand, ['ST-506', 'Quantum Fireball', 'Conner CP-30104', 'IBM Deskstar', 'Maxtor 2.1GB']);
  const cd = pick(rand, ['ATAPI CD-ROM', 'Mitsumi FX001D', 'SONY CDU', 'TEAC CD-532E']);
  const bios = pick(rand, ['PhoenixBIOS 4.0', 'AMI BIOS', 'Award Modular BIOS', 'MR BIOS']);
  const cpu = pick(rand, ['486DX2-66', 'Pentium 90', 'Pentium II 300', 'K6-2 350', 'Celeron 433']);

  const base = [
    { at: 0.0, text: `${bios} — Setup Utility`, color: 'rgba(170,220,255,0.9)' },
    { at: 0.6, text: `CPU: ${cpu}`, color: 'rgba(180,255,210,0.92)' },
    { at: 1.0, text: `Memory Test: ${mem} KB OK`, color: 'rgba(180,255,210,0.92)' },
    { at: 1.5, text: `Detecting IDE Primary Master... ${hdd}`, color: 'rgba(180,255,210,0.92)' },
    { at: 2.1, text: `Detecting ATAPI... ${cd}`, color: 'rgba(180,255,210,0.92)' },
    { at: 2.7, text: `Press DEL to enter Setup`, color: 'rgba(255,210,140,0.92)' },
    { at: 3.2, text: `Booting from A:`, color: 'rgba(180,255,210,0.92)' },
    { at: 3.8, text: `Starting MS-DOS...`, color: 'rgba(180,255,210,0.92)' },
  ];

  return base;
}

function makeDosLines(rand){
  const label = pick(rand, ['GAMES', 'UTILS', 'WORK', 'MIDI', 'BBS', 'TOOLS', 'ARCHIVE']);
  const hex4 = () => (((rand() * 0x10000) | 0).toString(16).padStart(4, '0').toUpperCase());
  const volSerial = `${hex4()}-${hex4()}`;

  const colorH = 'rgba(220,255,220,0.92)';
  const colorM = 'rgba(220,255,220,0.86)';
  const colorL = 'rgba(220,255,220,0.82)';

  const datePool = ['10-03-95', '10-04-95', '11-12-95', '02-18-96', '05-01-96', '09-09-96', '03-14-97'];
  const timePool = ['7:22p', '9:10p', '1:05a', '12:44a', '3:33p', '6:18p'];
  const pickDate = () => pick(rand, datePool);
  const pickTime = () => pick(rand, timePool);

  const rootDirs = [
    'GAMES', 'DEMOS', 'SOUND', 'DRIVERS', 'WINDOWS', 'DOS',
    'TEMP', 'DOCS', 'NET', 'UTILS', 'BACKUP', 'MODEM',
    'WFW', 'INTERNET', 'FONTS', 'TOOLS'
  ];
  const rootFiles = [
    { n: 'AUTOEXEC', e: 'BAT', s: 1024 },
    { n: 'CONFIG', e: 'SYS', s: 768 },
    { n: 'COMMAND', e: 'COM', s: 54645 },
    { n: 'MSCDEX', e: 'EXE', s: 23840 },
    { n: 'SMARTDRV', e: 'EXE', s: 46656 },
    { n: 'HIMEM', e: 'SYS', s: 11392 },
    { n: 'EMM386', e: 'EXE', s: 62912 },
    { n: 'DOSKEY', e: 'COM', s: 5416 },
    { n: 'MOUSE', e: 'COM', s: 15062 },
    { n: 'KEYB', e: 'COM', s: 15433 },
    { n: 'EDIT', e: 'COM', s: 413 },
    { n: 'ANSI', e: 'SYS', s: 9466 },
    { n: 'ATTRIB', e: 'EXE', s: 11264 },
    { n: 'XCOPY', e: 'EXE', s: 28416 },
    { n: 'DEFRAG', e: 'EXE', s: 77632 },
    { n: 'FDISK', e: 'EXE', s: 45712 },
    { n: 'FORMAT', e: 'COM', s: 40512 },
    { n: 'README', e: 'TXT', s: 3584 },
    { n: 'PKUNZIP', e: 'EXE', s: 24276 },
    { n: 'PKZIP', e: 'EXE', s: 29012 },
    { n: 'NWCACHE', e: 'EXE', s: 18432 },
    { n: 'WATTCP', e: 'CFG', s: 382 },
    { n: 'DIAL', e: 'CFG', s: 918 },
  ];

  const formatFile = (n, e, s) => `${n.padEnd(8, ' ')} ${e.padEnd(3, ' ')}  ${s.toLocaleString('en-US').padStart(9, ' ')}  ${pickDate()}  ${pickTime()}`;
  const formatDir = (d) => `${d.padEnd(8, ' ')} <DIR>            ${pickDate()}  ${pickTime()}`;

  const lines = [
    { at: 0.0, text: 'Microsoft(R) MS-DOS(R) Version 6.22', color: colorH },
    { at: 0.7, text: '(C)Copyright Microsoft Corp 1981-1994.', color: colorL },
    { at: 1.35, text: '', color: 'rgba(0,0,0,0)' },
    { at: 1.45, text: 'C:\\>dir', color: colorH },
    { at: 1.95, text: ` Volume in drive C is ${label}`, color: colorL },
    { at: 2.35, text: ` Volume Serial Number is ${volSerial}`, color: colorL },
    { at: 2.75, text: ' Directory of C:\\', color: colorL },
  ];

  let at = 3.15;

  // Root listing (longer; more believable utils/driver clutter)
  for (let i = 0; i < 4; i++){
    lines.push({ at, text: formatDir(rootDirs[i]), color: colorM });
    at += 0.75 + rand() * 0.55;
  }

  // a handful of files
  const fileCount = 12 + ((rand() * 8) | 0);
  for (let i = 0; i < fileCount; i++){
    const f = rootFiles[(rand() * rootFiles.length) | 0];
    lines.push({ at, text: formatFile(f.n, f.e, f.s + ((rand() * 2048) | 0)), color: colorM });
    at += 0.70 + rand() * 0.60;
  }

  // more dirs toward the end
  for (let i = 4; i < rootDirs.length; i++){
    if (rand() < 0.25) continue;
    lines.push({ at, text: formatDir(rootDirs[i]), color: colorM });
    at += 0.75 + rand() * 0.55;
  }

  const filesShown = fileCount + 2; // + AUTOEXEC/CONFIG-ish feel; approximate
  const dirsShown = rootDirs.length;
  const bytes = (120000 + ((rand() * 800000) | 0)).toLocaleString('en-US');
  const free = (250000000 + ((rand() * 1800000000) | 0)).toLocaleString('en-US');

  at += 0.7;
  lines.push({ at, text: `              ${filesShown} File(s)     ${bytes} bytes`, color: colorL });
  at += 0.45;
  lines.push({ at, text: `              ${dirsShown} Dir(s)  ${free} bytes free`, color: colorL });

  // A second mini-beat: cd into a directory and peek around
  const cdDir = pick(rand, ['GAMES', 'UTILS', 'DRIVERS', 'DOS']);
  at += 1.2;
  lines.push({ at, text: `C:\\>cd ${cdDir}`, color: colorH });
  at += 0.7;
  lines.push({ at, text: `C:\\${cdDir}>dir`, color: colorH });
  at += 0.55;
  lines.push({ at, text: ` Directory of C:\\${cdDir}`, color: colorL });

  const subFiles = [
    { n: 'SETUP', e: 'EXE', s: 192512 },
    { n: 'INSTALL', e: 'BAT', s: 2842 },
    { n: 'README', e: 'TXT', s: 7421 },
    { n: 'HISTORY', e: 'TXT', s: 6310 },
    { n: 'PATCH', e: 'ZIP', s: 88123 },
    { n: 'UPDATE', e: 'EXE', s: 118272 },
    { n: 'VESA', e: 'DRV', s: 21456 },
    { n: 'SOUND', e: 'CFG', s: 902 },
    { n: 'NET', e: 'CFG', s: 1142 },
    { n: 'DOS4GW', e: 'EXE', s: 265396 },
    { n: 'CWSDPMI', e: 'EXE', s: 20104 },
    { n: 'SVGA', e: 'CFG', s: 621 },
  ];
  const subN = 6 + ((rand() * 6) | 0);
  for (let i = 0; i < subN; i++){
    const f = subFiles[(rand() * subFiles.length) | 0];
    lines.push({ at, text: formatFile(f.n, f.e, f.s + ((rand() * 4096) | 0)), color: colorM });
    at += 0.70 + rand() * 0.60;
  }

  at += 1.0;
  lines.push({ at, text: `C:\\${cdDir}>type README.TXT`, color: colorH });
  at += 0.75;
  lines.push({ at, text: '*** README ***', color: colorL });
  at += 1.15;
  lines.push({ at, text: 'If this breaks, it was probably SMARTDRV.', color: colorM });
  at += 1.15;
  lines.push({ at, text: 'Try again with:  SET BLASTER=A220 I5 D1', color: colorM });
  at += 1.15;
  lines.push({ at, text: 'And remember: never trust a diskette you found.', color: colorM });

  at += 0.9;
  lines.push({ at, text: `C:\\${cdDir}>`, color: colorH });

  // keep the DOS segment alive a bit longer (less idle time on long segment durations)
  at += 1.1;
  lines.push({ at, text: `C:\\${cdDir}>mem /c`, color: colorH });
  at += 0.8;
  lines.push({ at, text: 'Memory Type        Total       Used       Free', color: colorL });
  at += 0.55;
  lines.push({ at, text: '----------------  --------   --------   --------', color: colorL });
  at += 0.55;
  lines.push({ at, text: 'Conventional        640K       112K       528K', color: colorM });
  at += 0.55;
  lines.push({ at, text: 'Upper               128K        32K        96K', color: colorM });
  at += 0.55;
  lines.push({ at, text: 'Extended          31,744K     1,024K    30,720K', color: colorM });
  at += 0.85;
  lines.push({ at, text: 'Largest executable program size         517,232 (505K)', color: colorL });

  at += 1.05;
  lines.push({ at, text: `C:\\${cdDir}>dir *.exe`, color: colorH });
  const exePool = [
    { n: 'SETUP', s: 192512 },
    { n: 'UPDATE', s: 118272 },
    { n: 'DOS4GW', s: 265396 },
    { n: 'CWSDPMI', s: 20104 },
  ];
  const exeN = 2 + ((rand() * 3) | 0);
  for (let i = 0; i < exeN; i++){
    const f = exePool[(rand() * exePool.length) | 0];
    at += 0.70 + rand() * 0.55;
    lines.push({ at, text: formatFile(f.n, 'EXE', f.s + ((rand() * 4096) | 0)), color: colorM });
  }

  at += 0.95;
  lines.push({ at, text: `C:\\${cdDir}>`, color: colorH });

  // quick disk-check beat (classic utilities): SCANDISK + Norton Disk Doctor
  at += 1.05;
  lines.push({ at, text: `C:\\${cdDir}>scandisk c: /autofix`, color: colorH });
  at += 0.75;
  lines.push({ at, text: 'Microsoft ScanDisk Version 6.22', color: colorL });
  at += 0.65;
  lines.push({ at, text: 'ScanDisk is checking drive C:', color: colorM });
  at += 0.70;
  lines.push({ at, text: 'Checking file allocation table...  OK', color: colorM });
  at += 0.70;
  lines.push({ at, text: 'Checking directory structure...     OK', color: colorM });
  at += 0.70;
  lines.push({ at, text: 'Checking file system...', color: colorM });
  at += 0.70;
  lines.push({ at, text: 'No errors found.', color: colorL });

  at += 1.10;
  lines.push({ at, text: `C:\\${cdDir}>ndd c:`, color: colorH });
  at += 0.75;
  lines.push({ at, text: 'Norton Utilities — Disk Doctor', color: colorL });
  at += 0.70;
  lines.push({ at, text: 'Analyzing disk structures...', color: colorM });
  at += 0.75;
  lines.push({ at, text: 'All tests completed successfully.', color: colorL });

  at += 0.95;
  lines.push({ at, text: `C:\\${cdDir}>`, color: colorH });

  return lines;
}

function makeLinuxLines(rand){
  const host = pick(rand, ['quartz', 'saturn', 'beige-box', 'tiger', 'nebula', 'hermes']);
  const kernel = pick(rand, ['2.4.37', '2.6.32', '3.2.0', '4.4.0']);
  const iface = pick(rand, ['eth0', 'eth1', 'wlan0', 'ens33']);
  const disk = pick(rand, ['hda', 'hdb', 'sda', 'sdb']);

  const cK = 'rgba(190,210,255,0.85)';
  const cG = 'rgba(210,255,220,0.85)';
  const cY = 'rgba(255,240,170,0.85)';
  const cW = 'rgba(255,255,255,0.92)';

  const lines = [
    { at: 0.0, text: `Booting Linux ${kernel}...`, color: 'rgba(230,230,230,0.9)' },
    { at: 0.6, text: '[    0.000000] BIOS-provided physical RAM map:', color: cK },
    { at: 1.1, text: '[    0.000000]  0000000000000000 - 000000000009f000 (usable)', color: cK },
    { at: 1.7, text: '[    0.000000]  0000000000100000 - 000000001ff00000 (usable)', color: cK },
  ];

  // extra boot/probe chatter so the segment doesn’t go idle after ~8s
  let at = 2.2;
  const probePool = [
    () => `[    0.${(180 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] PCI: Probing PCI hardware`,
    () => `[    0.${(190 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] ACPI: Subsystem revision ${(20040000 + ((rand() * 3000000) | 0)).toString()}`, 
    () => `[    0.${(200 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] ${disk}: ST${50000 + ((rand() * 50000) | 0)} (${(2 + ((rand() * 30) | 0))} GB)`,
    () => `[    0.${(210 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] Uniform Multi-Platform E-IDE driver Revision: 7.00alpha2`,
    () => `[    0.${(220 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] ${disk}: dma_intr: status=0x51 { DriveReady SeekComplete Error }`,
    () => `[    0.${(230 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] Floppy drive(s): fd0 is 1.44M`,
    () => `[    0.${(240 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] ide0: reset: success`,
    () => `[    0.${(250 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] scsi0 : Adaptec AIC7XXX EISA/VLB SCSI driver`,
    () => `[    0.${(260 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] usbcore: registered new interface driver hub`,
    () => `[    0.${(270 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] PCI: Sharing IRQ 11 with 00:0f.0`,
    () => `[    0.${(280 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] input: AT Translated Set 2 keyboard as /class/input/input0`,
    () => `[    0.${(290 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] NET: Registered protocol family 2`,
    () => `[    0.${(300 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] ${iface}: link up, 100Mbps, full duplex`,
    () => `[    0.${(310 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] Adding ${(256 + ((rand() * 1536) | 0))}k swap on /dev/${disk}2.  Priority:-1 extents:1 across:${(256 + ((rand() * 1536) | 0))}k`,
    () => `[    0.${(320 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] VFS: Mounted root (ext3 filesystem) readonly`,
    () => `[    0.${(330 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] EXT3-fs: mounted filesystem with ordered data mode.`,
    () => `[    0.${(340 + ((rand() * 700) | 0)).toString().padStart(6, '0')}] ALSA device list:`,
    () => `[    0.${(350 + ((rand() * 700) | 0)).toString().padStart(6, '0')}]   #0: Intel 82801AA-ICH at 0xd000, irq ${(5 + ((rand() * 9) | 0))}`,
  ];

  const probeN = 7 + ((rand() * 6) | 0);
  for (let i = 0; i < probeN; i++){
    lines.push({ at, text: probePool[(rand() * probePool.length) | 0](), color: cG });
    at += 0.95 + rand() * 0.85;
  }

  at += 0.4;
  lines.push({ at, text: '[    1.020000] Freeing unused kernel memory: 196k freed', color: cK });
  at += 0.8;

  const servicePool = [
    'Starting syslogd: [  OK  ]',
    'Starting klogd: [  OK  ]',
    'Checking root filesystem: [  OK  ]',
    'Remounting root filesystem in read-write mode: [  OK  ]',
    'Mounting local filesystems: [  OK  ]',
    'Starting udev: [  OK  ]',
    'Starting hotplug: [  OK  ]',
    'Starting network: [  OK  ]',
    'Bringing up interface lo: [  OK  ]',
    'Bringing up interface eth0: [  OK  ]',
    'Starting inetd: [  OK  ]',
    'Starting portmap: [  OK  ]',
    'Starting nfslock: [  OK  ]',
    'Starting crond: [  OK  ]',
    'Starting atd: [  OK  ]',
    'Starting sshd: [  OK  ]',
    'Starting lpd: [  OK  ]',
    'Starting cups: [  OK  ]',
  ];

  const svcN = 5 + ((rand() * 4) | 0);
  for (let i = 0; i < svcN; i++){
    lines.push({ at, text: `[    1.${(100 + ((rand() * 800) | 0)).toString().padStart(6, '0')}] ${pick(rand, servicePool)}`, color: cY });
    at += 1.25 + rand() * 0.85;
  }

  at += 0.8;
  lines.push({ at, text: '', color: 'rgba(0,0,0,0)' });
  at += 0.2;
  lines.push({ at, text: `${host} login: `, color: cW });
  at += 0.6;
  lines.push({ at, text: 'guest', color: cW });
  at += 0.6;
  lines.push({ at, text: 'Password: ', color: cW });
  at += 0.55;
  lines.push({ at, text: '********', color: cW });
  at += 0.7;
  lines.push({ at, text: 'Last login: Sat Feb  7 07:00:00 on tty1', color: cK });

  // a little interactive session
  const prompt = `${host}:~$ `;
  at += 0.8;
  lines.push({ at, text: `${prompt}uname -a`, color: cG });
  at += 0.8;
  lines.push({ at, text: `Linux ${host} ${kernel} #1 SMP Tue Feb 7 07:00:00 UTC i686 GNU/Linux`, color: cK });

  at += 1.2;
  lines.push({ at, text: `${prompt}ifconfig ${iface}`, color: cG });
  at += 0.9;
  lines.push({ at, text: `${iface}      Link encap:Ethernet  HWaddr 00:0C:29:${hexByte(rand)}:${hexByte(rand)}:${hexByte(rand)}`, color: cK });
  at += 0.6;
  lines.push({ at, text: `          inet addr:192.168.${10 + ((rand() * 40) | 0)}.${20 + ((rand() * 200) | 0)}  Bcast:192.168.0.255  Mask:255.255.255.0`, color: cK });

  at += 1.2;
  lines.push({ at, text: `${prompt}ls -la`, color: cG });
  at += 0.8;
  lines.push({ at, text: 'total 64', color: cK });
  lines.push({ at: at + 0.4, text: 'drwxr-xr-x  5 guest users  4096 Feb  7 07:00 .', color: cK });
  lines.push({ at: at + 0.8, text: 'drwxr-xr-x 12 root  root   4096 Feb  7 06:58 ..', color: cK });
  lines.push({ at: at + 1.2, text: '-rw-r--r--  1 guest users   220 Jan  1  1998 .bash_logout', color: cK });
  lines.push({ at: at + 1.6, text: '-rw-r--r--  1 guest users  3526 Jan  1  1998 .bashrc', color: cK });
  lines.push({ at: at + 2.0, text: '-rw-r--r--  1 guest users   675 Jan  1  1998 .profile', color: cK });
  at += 2.6;

  at += 1.1;
  lines.push({ at, text: `${prompt}dmesg | tail -n 4`, color: cG });
  at += 0.8;
  lines.push({ at, text: `[   12.${(100 + ((rand() * 800) | 0)).toString().padStart(6, '0')}] ${iface}: link up, 100Mbps`, color: cK });
  lines.push({ at: at + 0.5, text: `[   12.${(200 + ((rand() * 800) | 0)).toString().padStart(6, '0')}] ${disk}: cache flush complete`, color: cK });
  lines.push({ at: at + 1.0, text: `[   12.${(300 + ((rand() * 800) | 0)).toString().padStart(6, '0')}] EXT3-fs: recovery complete`, color: cK });
  lines.push({ at: at + 1.5, text: `[   12.${(400 + ((rand() * 800) | 0)).toString().padStart(6, '0')}] audit: enabled`, color: cK });
  at += 2.1;

  // a few more commands to avoid the segment going idle on long durations
  const upDays = 1 + ((rand() * 12) | 0);
  const upH = ((rand() * 23) | 0);
  const upM = ((rand() * 59) | 0);

  at += 1.2;
  lines.push({ at, text: `${prompt}uptime`, color: cG });
  at += 0.8;
  lines.push({ at, text: ` ${String(7 + ((rand() * 2) | 0)).padStart(2,'0')}:${String(((rand() * 59) | 0)).padStart(2,'0')}:${String(((rand() * 59) | 0)).padStart(2,'0')} up ${upDays} days,  ${upH}:${String(upM).padStart(2,'0')},  1 user,  load average: 0.0${(rand()*9)|0}, 0.0${(rand()*9)|0}, 0.0${(rand()*9)|0}`, color: cK });

  at += 1.1;
  lines.push({ at, text: `${prompt}df -h`, color: cG });
  at += 0.85;
  lines.push({ at, text: 'Filesystem            Size  Used Avail Use% Mounted on', color: cK });
  const rootSize = 2 + ((rand() * 14) | 0);
  const rootUsed = Math.max(1, ((rand() * rootSize) | 0));
  const rootAvail = Math.max(1, rootSize - rootUsed);
  at += 0.55;
  lines.push({ at, text: `/dev/${disk}1              ${String(rootSize).padStart(2,' ')}G  ${String(rootUsed).padStart(2,' ')}G  ${String(rootAvail).padStart(2,' ')}G ${String(Math.min(99, Math.floor((rootUsed/rootSize)*100))).padStart(3,' ')}% /`, color: cK });
  at += 0.55;
  lines.push({ at, text: 'tmpfs                 128M     0  128M   0% /dev/shm', color: cK });
  at += 0.55;
  lines.push({ at, text: `/dev/${disk}2              512M   24M  488M   5% /boot`, color: cK });

  at += 1.15;
  lines.push({ at, text: `${prompt}`, color: cG });

  return lines;
}

function hexByte(rand){
  return (((rand() * 256) | 0).toString(16).padStart(2, '0').toUpperCase());
}

function makeMacScreen(rand){
  const sys = pick(rand, ['System 6', 'System 7', 'Mac OS 8']);
  const specks = Array.from({ length: 42 }, () => ({ x: rand(), y: rand() }));
  return {
    title: `${sys} — Welcome`,
    draw(ctx, w, h, t){
      // beige background + centered window
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0, '#d9d1bf');
      g.addColorStop(1, '#cbbfa8');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,w,h);

      const s = Math.min(w,h);
      const ww = Math.floor(s*0.62);
      const wh = Math.floor(s*0.40);
      const x = Math.floor((w-ww)/2);
      const y = Math.floor((h-wh)/2);

      // window
      ctx.save();
      ctx.fillStyle = 'rgba(245,245,245,0.92)';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, ww, wh, 14);
      ctx.fill();
      ctx.stroke();

      // title bar
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x+2, y+2, ww-4, Math.floor(wh*0.14));

      // smiley
      const cx = x + ww*0.5;
      const cy = y + wh*0.46;
      const r = Math.floor(Math.min(ww,wh)*0.18);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(245,245,245,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, r-4, 0, Math.PI*2);
      ctx.fill();
      // eyes
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(cx - r*0.35, cy - r*0.20, r*0.10, 0, Math.PI*2);
      ctx.arc(cx + r*0.35, cy - r*0.20, r*0.10, 0, Math.PI*2);
      ctx.fill();
      // mouth
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy + r*0.05, r*0.55, 0.1*Math.PI, 0.9*Math.PI);
      ctx.stroke();

      // message + progress bar (layout avoids overlap on small renders)
      const fontPx = Math.floor(wh*0.10);
      const pbw = Math.floor(ww*0.62);
      const pbh = Math.floor(wh*0.08);
      const gap = Math.max(6, Math.floor(wh*0.05));
      const marginB = Math.max(8, Math.floor(wh*0.06));
      const px = Math.floor(cx - pbw/2);
      const py = Math.floor(y + wh - marginB - pbh);

      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('Welcome to Macintosh.', cx, py - gap);

      // progress bar
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      roundRect(ctx, px, py, pbw, pbh, 8);
      ctx.stroke();

      const u = clamp01(t / 6.5);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      roundRect(ctx, px+3, py+3, Math.floor((pbw-6)*u), pbh-6, 6);
      ctx.fill();

      ctx.restore();

      // subtle pattern
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffffff';
      for (let i=0;i<specks.length;i++){
        const bx = (specks[i].x*w)|0;
        const by = (specks[i].y*h)|0;
        ctx.fillRect(bx, by, 1, 1);
      }
      ctx.restore();
    }
  };
}

function drawTyped(ctx, {x, y, lineH, lines, t, cps=34, cursor=true, maxLines=null}){
  let last = null; // {x,y,w,text}

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const rendered = [];

  for (let i = 0; i < lines.length; i++){
    const L = lines[i];
    if (t < L.at) continue;

    const dt = t - L.at;
    const n = Math.max(0, Math.min(L.text.length, Math.floor(dt * cps)));
    const s = L.text.slice(0, n);

    if (s.length === 0 && L.text.length !== 0) continue;

    rendered.push({
      text: s,
      color: L.color || 'rgba(220,255,220,0.92)'
    });
  }

  const maxN = (typeof maxLines === 'number' && isFinite(maxLines)) ? Math.max(1, Math.floor(maxLines)) : null;
  const start = (maxN && rendered.length > maxN) ? (rendered.length - maxN) : 0;

  let yy = y;
  for (let i = start; i < rendered.length; i++){
    const R = rendered[i];
    ctx.fillStyle = R.color;
    ctx.fillText(R.text, x, yy);
    last = { x, y: yy, w: ctx.measureText(R.text).width, text: R.text };
    yy += lineH;
  }

  // cursor blink at end of last visible line
  if (cursor && last && !last.text.endsWith('_')){
    const blink = (Math.sin(t * 4.2) > 0);
    if (blink){
      const cx = last.x + last.w;
      const cy = last.y;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(cx, cy + Math.floor(lineH * 0.10), Math.floor(lineH * 0.62), Math.floor(lineH * 0.78));
    }
  }
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0;
  let t = 0;

  // render buffer (for CRT overlays)
  let buf = null;
  let bctx = null;
  let scanPat = null;
  let crtOverlay = null; // cached scanlines + vignette (rebuilt on init/resize)

  // sequence state
  let segIdx = 0;
  let segT = 0;

  // content
  let biosLines = [];
  let dosLines = [];
  let linuxLines = [];
  let macScreen = null;

  // audio
  let ah = null;
  let nextClick = 0.0;

  function buildContent(){
    biosLines = makeBootLines(rand);
    dosLines = makeDosLines(rand);
    linuxLines = makeLinuxLines(rand);
    macScreen = makeMacScreen(rand);
  }

  function rebuildCrtOverlay(){
    // Cache scanlines + vignette into an offscreen layer so steady-state renderCRT()
    // does 0 createPattern()/createRadialGradient() calls.
    if (!w || !h || !scanPat){
      crtOverlay = null;
      return;
    }

    const o = document.createElement('canvas');
    o.width = w; o.height = h;
    const octx = o.getContext('2d');

    // scanlines
    octx.save();
    octx.globalAlpha = 0.10;
    const pat = octx.createPattern(scanPat, 'repeat');
    if (pat){
      octx.fillStyle = pat;
      octx.fillRect(0, 0, w, h);
    }

    // vignette
    octx.globalAlpha = 1;
    const vg = octx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.2, w*0.5, h*0.5, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    octx.fillStyle = vg;
    octx.fillRect(0, 0, w, h);

    octx.restore();
    crtOverlay = o;
  }

  // Stretch the loop to ~3–5 minutes total (default was ~41s).
  const SEG_DUR_SCALE = 5.5;

  const SEGMENTS = [
    { key: 'bios', title: 'POST / BIOS', dur: 9.5 * SEG_DUR_SCALE },
    { key: 'dos', title: 'MS-DOS Prompt', dur: 10.5 * SEG_DUR_SCALE },
    { key: 'mac', title: 'Classic Desktop', dur: 9.5 * SEG_DUR_SCALE },
    { key: 'linux', title: 'Linux Boot Log', dur: 11.5 * SEG_DUR_SCALE },
  ];

  // Fixed-timestep simulation so click/beep schedules are stable across FPS.
  const SIM_DT = 1/60;
  const MAX_SIM_STEPS = 12;
  let simAcc = 0;

  function init({ width, height }){
    w = width; h = height; t = 0;
    simAcc = 0;

    buf = document.createElement('canvas');
    buf.width = w; buf.height = h;
    bctx = buf.getContext('2d');

    scanPat = makeScanPattern();
    rebuildCrtOverlay();

    segIdx = (seed >>> 0) % SEGMENTS.length;
    segT = 0;

    nextClick = 0.18;

    buildContent();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(audio.master);

    // CRT-ish hum: low oscillator + a touch of brown noise.
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 54;

    const humGain = ctx.createGain();
    humGain.gain.value = 0.0;

    const t0 = ctx.currentTime;
    humGain.gain.setValueAtTime(0.0001, t0);
    humGain.gain.exponentialRampToValueAtTime(0.017, t0 + 0.4);

    hum.connect(humGain);
    humGain.connect(out);

    const n = audio.noiseSource({ type: 'brown', gain: 0.010 });
    // reroute noise to our out
    try { n.gain.disconnect(); } catch {}
    n.gain.connect(out);

    hum.start();
    n.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.08); } catch {}
        try { hum.stop(now + 0.25); } catch {}
        try { n.stop(); } catch {}
      }
    };
  }

  function stopAudio({ clearCurrent = false } = {}){
    const handle = ah;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ah = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    if (ah && audio.current === ah) return;

    stopAudio({ clearCurrent: true });
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    stopAudio({ clearCurrent: true });
  }

  function destroy(){
    // Only clears AudioManager.current when we own it.
    stopAudio({ clearCurrent: true });
  }

  function stepSim(dt){
    t += dt;
    segT += dt;

    const seg = SEGMENTS[segIdx];
    if (segT >= seg.dur){
      segIdx = (segIdx + 1) % SEGMENTS.length;
      segT = 0;

      // a little "tuning" tick on segment swap
      if (audio.enabled) audio.beep({ freq: 420 + rand()*280, dur: 0.02, gain: 0.028, type: 'square' });
    }

    // disk clicks / keyboard ticks
    nextClick -= dt;
    if (nextClick <= 0){
      nextClick = 0.08 + rand()*0.45;
      if (audio.enabled){
        const f = 130 + rand()*420;
        audio.beep({ freq: f, dur: 0.012 + rand()*0.016, gain: 0.018 + rand()*0.010, type: rand() < 0.6 ? 'square' : 'triangle' });
      }
    }
  }

  function update(dt){
    // Clamp: background tab / breakpoint stalls can dump huge dt.
    const d = Math.max(0, Math.min(0.10, dt || 0));
    simAcc += d;

    let steps = 0;
    while (simAcc >= SIM_DT && steps < MAX_SIM_STEPS){
      stepSim(SIM_DT);
      simAcc -= SIM_DT;
      steps++;
    }

    // Avoid a spiral-of-death in worst-case hitches.
    if (steps === MAX_SIM_STEPS) simAcc = Math.min(simAcc, SIM_DT);
  }

  function drawHud(ctx, title){
    const s = Math.min(w, h);
    const pad = Math.max(10, Math.floor(s * 0.02));
    const boxW = Math.floor(s * 0.52);
    const boxH = Math.floor(s * 0.10);
    // Top-right overlay to avoid colliding with the boot text.
    const x = Math.max(pad, w - pad - boxW);
    const y = pad;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    // Clip contents so text can’t overflow the rounded HUD container (small renders / long titles).
    ctx.save();
    roundRect(ctx, x+1, y+1, boxW-2, boxH-2, 11);
    ctx.clip();

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = `${Math.floor(boxH*0.34)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('RETRO BOOT SEQUENCE', x + 14, y + Math.floor(boxH*0.24));

    ctx.fillStyle = 'rgba(255,210,140,0.90)';
    ctx.font = `${Math.floor(boxH*0.30)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(title, x + 14, y + Math.floor(boxH*0.66));

    // disk LED
    const ledX = x + boxW - 18;
    const ledY = y + Math.floor(boxH*0.54);
    const on = (Math.sin(t * 9.0) > 0.35) || (segT < 1.2);
    ctx.fillStyle = on ? 'rgba(120,255,170,0.95)' : 'rgba(80,110,90,0.45)';
    ctx.beginPath();
    ctx.arc(ledX, ledY, 5, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  function renderCRT(ctx){
    // subtle scanlines + vignette + flicker over whatever is already drawn
    ctx.save();

    // scanlines + vignette (cached)
    ctx.globalAlpha = 1;
    if (crtOverlay) ctx.drawImage(crtOverlay, 0, 0);

    // flicker
    const flickerBucket = Math.floor(t * 24);
    const flickerN = hash01((seed ^ 0x9e3779b9) + flickerBucket * 0x85ebca6b);
    const f = 0.006 + 0.006 * Math.sin(t * 23.0) + 0.0025 * (flickerN - 0.5);
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.018, Math.max(0, f))})`;
    ctx.fillRect(0, 0, w, h);

    // tiny noise specks (cheap)
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    const speckBucket = Math.floor(t * 12);
    for (let i=0; i<28; i++){
      const x = Math.floor(hash01((seed + 0x1b873593) ^ (speckBucket * 0x9e3779b9) ^ (i * 0x85ebca6b)) * w);
      const y = Math.floor(hash01((seed + 0x85ebca6b) ^ (speckBucket * 0xc2b2ae35) ^ (i * 0x27d4eb2d)) * h);
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();
  }

  function render(ctx){
    const seg = SEGMENTS[segIdx];

    // draw base frame into buffer
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, w, h);

    if (seg.key === 'bios'){
      const g = bctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#001019');
      g.addColorStop(1, '#00030a');
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, w, h);

      const s = Math.min(w, h);
      const pad = Math.max(18, Math.floor(s * 0.05));
      const font = Math.floor(s * 0.032);
      bctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      drawTyped(bctx, { x: pad, y: pad*1.9, lineH: Math.floor(font*1.35), lines: biosLines, t: segT, cps: 42, cursor: false });

      // a simple memory bar
      const u = clamp01(segT / 6.0);
      bctx.strokeStyle = 'rgba(170,220,255,0.35)';
      bctx.lineWidth = 2;
      const bw = Math.floor(w * 0.54);
      const bh = Math.max(10, Math.floor(h * 0.016));
      const bx = pad;
      const by = Math.floor(h - pad*1.3);
      roundRect(bctx, bx, by, bw, bh, 6);
      bctx.stroke();
      bctx.fillStyle = 'rgba(120,255,170,0.25)';
      roundRect(bctx, bx+3, by+3, Math.floor((bw-6)*u), bh-6, 5);
      bctx.fill();

    } else if (seg.key === 'dos'){
      bctx.fillStyle = '#001400';
      bctx.fillRect(0,0,w,h);

      const s = Math.min(w, h);
      const pad = Math.max(18, Math.floor(s * 0.05));
      const font = Math.floor(s * 0.034);
      bctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      // faint phosphor glow via shadow
      bctx.save();
      bctx.shadowColor = 'rgba(120,255,160,0.35)';
      bctx.shadowBlur = Math.floor(font * 0.35);
      const y0 = pad * 1.6;
      const lineH = Math.floor(font * 1.30);
      const maxLines = Math.floor((h - y0 - pad * 0.7) / lineH);
      drawTyped(bctx, { x: pad, y: y0, lineH, maxLines, lines: dosLines, t: segT, cps: 48, cursor: true });
      bctx.restore();

    } else if (seg.key === 'mac'){
      macScreen.draw(bctx, w, h, segT);

    } else if (seg.key === 'linux'){
      bctx.fillStyle = '#070a0f';
      bctx.fillRect(0,0,w,h);

      const s = Math.min(w, h);
      const pad = Math.max(18, Math.floor(s * 0.05));
      const font = Math.floor(s * 0.030);
      bctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      const y0 = pad * 1.8;
      const lineH = Math.floor(font * 1.35);
      const maxLines = Math.floor((h - y0 - pad * 0.8) / lineH);
      drawTyped(bctx, { x: pad, y: y0, lineH, maxLines, lines: linuxLines, t: segT, cps: 58, cursor: true });

      // a little "progress" spinner
      const sp = ['|','/','-','\\'][(Math.floor(segT*8))%4];
      bctx.fillStyle = 'rgba(255,255,255,0.22)';
      bctx.fillText(sp, w - pad*1.4, pad*1.2);
    }

    // subtle ghosting: re-draw buffer slightly offset onto itself
    bctx.save();
    bctx.globalAlpha = 0.06;
    bctx.drawImage(buf, 1, 0);
    bctx.restore();

    // now composite to main
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.drawImage(buf, 0, 0);

    drawHud(ctx, seg.title);
    renderCRT(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
