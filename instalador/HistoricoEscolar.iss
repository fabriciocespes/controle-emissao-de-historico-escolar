; Script do instalador - Controle de Emissão de Histórico Escolar
; Compilar com: instalador\compilar.bat  (recomendado — checa o ambiente e
; resolve o caminho do node.exe)   ou   ISCC.exe instalador\HistoricoEscolar.iss

#define NomeApp "Controle de Emissão de Histórico Escolar"
#define Versao "1.4"

; ---------------------------------------------------------------
; Pré-checagens com mensagem clara. Sem elas o ISCC só diria
; "No files found matching ..." (node_modules ausente, linha 43 do [Files]) ou
; "Source file ... does not exist" (node.exe em outro caminho, linha 44) —
; erros típicos ao compilar em outra máquina.
; FileExists relativo resolve na pasta do script (igual aos Source:).
; ---------------------------------------------------------------
#ifndef NodeExe
  #define NodeExe "C:\Program Files\nodejs\node.exe"
#endif
#if !FileExists(NodeExe)
  #error "node.exe não encontrado. Instale o Node.js com o instalador padrão (em C:\Program Files\nodejs) ou informe o caminho do seu node.exe: ISCC.exe /DNodeExe=C:\caminho\node.exe instalador\HistoricoEscolar.iss — o instalador\compilar.bat faz isso sozinho."
#endif
#if !FileExists("..\node_modules\pdfkit\package.json")
  #error "Dependências não instaladas: falta a pasta node_modules. Rode 'npm install --omit=dev' na pasta do projeto antes de compilar o instalador."
#endif

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
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs; Excludes: "node_modules\*,backups\*,.git\*,.gitignore,.gitattributes,data\*,pdfs\*,tests\*,dist\*,instalador\*,temp_docx\*,planilhas\*,test-results\*,playwright-report\*,playwright.config.js,*.log,*.csv,*.pdf,*.db,listar-marcadores.js,testar-ficha.js,marcadores-lista.txt"
Source: "..\node_modules\*"; DestDir: "{app}\node_modules"; Flags: ignoreversion recursesubdirs; Excludes: "@playwright\*,playwright\*,playwright-core\*,.bin\playwright*"
Source: "{#NodeExe}"; DestDir: "{app}"; Flags: ignoreversion
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

; ---------------------------------------------------------------
; Atualização sem perder dados: instalar a versão nova POR CIMA da
; antiga é a atualização (mesmo AppId -> mesma pasta -> a entrada de
; desinstalar é atualizada, não duplicada). O pacote nunca leva
; data\, pdfs\ nem backups\ (ver Excludes acima), então só os
; arquivos do programa são substituídos; as pastas de dados ficam.
; ---------------------------------------------------------------

[Code]
var
  Atualizando: Boolean;
  AvisoAtualizacaoExibido: Boolean;

function InstalacaoAnterior(): Boolean;
begin
  // Chave de desinstalação da instalação anterior. O instalador roda sem
  // admin (PrivilegesRequired=lowest), então a entrada fica em HKCU.
  Result := RegKeyExists(HKCU,
    'Software\Microsoft\Windows\CurrentVersion\Uninstall\{8C2E5F41-7A9B-4D3E-B1C6-0A9E2F7D8B35}_is1');
end;

function InitializeSetup(): Boolean;
begin
  Atualizando := InstalacaoAnterior();
  AvisoAtualizacaoExibido := False;
  Result := True;
end;

// Para o servidor que estiver rodando antes de copiar por cima — node.exe
// em uso derrubaria a atualização no meio (mesma ação do [UninstallRun]).
procedure EncerrarServidor();
var
  ResultCode: Integer;
begin
  Exec('powershell.exe',
    '-NoProfile -WindowStyle Hidden -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = wpReady then
  begin
    // {app} só é confiável depois que a página de destino foi escolhida.
    if not Atualizando then
      Atualizando := FileExists(ExpandConstant('{app}\server.js'));
    if Atualizando and (not AvisoAtualizacaoExibido) then
    begin
      WizardForm.ReadyLabel.Caption :=
        'Atualização do sistema instalado.' + #13#10 + #13#10 +
        'Os arquivos do programa serão substituídos pela versão nova e a pasta ' +
        'continua a mesma. Os dados serão mantidos: o banco (pasta data), os PDFs ' +
        '(pasta pdfs) e os backups (pasta backups) não são tocados pelo instalador. ' +
        'As migrações do banco rodam sozinhas na primeira abertura.' + #13#10 + #13#10 +
        'Recomenda-se fazer um backup antes (menu Backup do sistema).';
      AvisoAtualizacaoExibido := True;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  EncerrarServidor();
  Result := '';
end;
