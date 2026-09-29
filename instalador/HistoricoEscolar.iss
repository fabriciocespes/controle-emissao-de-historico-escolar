; Script do instalador - Controle de Emissão de Histórico Escolar
; Compilar com: ISCC.exe instalador\HistoricoEscolar.iss

#define NomeApp "Controle de Emissão de Histórico Escolar"
#define Versao "1.0"

[Setup]
AppId={{8C2E5F41-7A9B-4D3E-B1C6-0A9E2F7D8B35}
AppName={#NomeApp}
AppVersion={#Versao}
AppPublisher=Fabricio Cespes
DefaultDirName={autopf}\HistoricoEscolar
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=Instalador-HistoricoEscolar
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#NomeApp}
UninstallDisplayIcon={app}\node.exe

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar um ícone na área de trabalho"; GroupDescription: "Atalhos:"

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs; Excludes: ".git\*,data\*,pdfs\*,tests\*,dist\*,instalador\*,*.log"
Source: "C:\Program Files\nodejs\node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "Iniciar.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "Encerrar.vbs"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{app}\data"
Name: "{app}\pdfs"

[Icons]
Name: "{autodesktop}\Controle de Histórico Escolar"; Filename: "{app}\Iniciar.vbs"; IconFilename: "{app}\node.exe"; IconIndex: 0; Tasks: desktopicon
Name: "{group}\Controle de Histórico Escolar"; Filename: "{app}\Iniciar.vbs"; IconFilename: "{app}\node.exe"; IconIndex: 0
Name: "{group}\Encerrar o sistema"; Filename: "{app}\Encerrar.vbs"
Name: "{group}\Desinstalar"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\Iniciar.vbs"; Description: "Abrir o sistema agora"; Flags: shellexec postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -Command ""(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess | ForEach-Object {{ Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}"""; RunOnceId: "Encerrar"; Flags: runhidden
