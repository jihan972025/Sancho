# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['pyinstaller_entry.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('backend/skills/definitions', 'backend/skills/definitions'),
    ],
    hiddenimports=[
        'feedparser',
        'yfinance',
        'ccxt',
        'tradingview_ta',
        'geopy',
        'geopy.geocoders',
        'timezonefinder',
        'pyshorteners',
        'ddgs',
        'gnews',
        'googlenewsdecoder',
        'wikipedia',
        'apscheduler',
        'apscheduler.schedulers.asyncio',
        'httpx',
        'openai',
        'anthropic',
        'google.genai',
        'zhipuai',
        'dotenv',
        'pyupbit',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='main',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='main',
)
