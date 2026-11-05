; Script do instalador - Controle de Emissão de Histórico Escolar
; Compilar com: ISCC.exe instalador\HistoricoEscolar.iss

#define NomeApp "Controle de Emissão de Histórico Escolar"
#define Versao "1.1"

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
; Pacote do sistema: código + dependências de produção.
; NUNCA empacotar dados: pasta data\ (banco, logo, calendários), pdfs\,
; planilhas\ (dados reais), CSVs/PDFs/DBs soltos na raiz. O banco nasce
; limpo no destino — o server.js cria o DB novo e semeia o usuário admin
; na primeira execução.
; ATENÇÃO: o Excludes do Inno casa o padrão em QUALQUER profundidade do
; caminho (data\* pegaria node_modules\pdfkit\js\data\, dist\* pegaria
; node_modules\fontkit\dist\...). Por isso node_modules vai numa entrada
; própria, com exclusões só de dev (Playwright).
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs; Excludes: "node_modules\*,.git\*,.gitignore,.gitattributes,data\*,pdfs\*,tests\*,dist\*,instalador\*,temp_docx\*,planilhas\*,test-results\*,playwright-report\*,playwright.config.js,*.log,*.csv,*.pdf,*.db,listar-marcadores.js,testar-ficha.js,marcadores-lista.txt"
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs; Excludes: "@playwright\*,playwright\*,playwright-core\*,.bin\playwright*"
Source: "C:\Program Files\nodejs\node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "Iniciar.vbs"; DestDir: "{app}"; Flags: ignoreversion
Source: "Encerrar.vbs"; DestDir: "{app}"; Flags: ignoreversion
; Modelos em branco da importação em lote (gerados por gerar-modelos.js
; a partir das constantes das rotas — sem dados reais).
Source: "modelos\modelo-importacao-alunos.csv"; DestDir: "{app}\planilhas"; Flags: ignoreversion
Source: "modelos\modelo-importacao-funcionarios.csv"; DestDir: "{app}\planilhas"; Flags: ignoreversion

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
