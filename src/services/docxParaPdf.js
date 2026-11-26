const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Converte o .docx da ficha de matrícula em PDF usando o Microsoft Word
// instalado na máquina (automação COM disparada pelo PowerShell). É o único
// caminho fiel ao modelo oficial: recriar o formulário em outra biblioteca
// perderia a diagramação (tabelas, caixas e linhas de assinatura).
//
// Sem Word (ou se a conversão falhar) o chamador recebe um Error e a rota
// devolve o .docx de sempre — a ficha nunca se perde por causa do PDF.

// Script em ASCII puro: gravado sem BOM, o PowerShell 5.1 lê como ANSI e
// um acento quebraria a leitura do arquivo.
const SCRIPT = [
  'param(',
  '  [Parameter(Mandatory = $true)][string]$Entrada,',
  '  [Parameter(Mandatory = $true)][string]$Saida',
  ')',
  "$ErrorActionPreference = 'Stop'",
  '$word = $null',
  '$doc = $null',
  'try {',
  '  $word = New-Object -ComObject Word.Application',
  '  $word.Visible = $false',
  '  $word.DisplayAlerts = 0',
  '  $word.Options.SaveNormalPrompt = $false',
  '  $doc = $word.Documents.Open($Entrada, $false, $true)',
  '  $doc.ExportAsFixedFormat($Saida, 17)',
  '} finally {',
  '  if ($doc -ne $null) { try { $doc.Close(0) } catch {} }',
  '  if ($word -ne $null) { try { $word.Quit() } catch {} }',
  '  if ($doc -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($doc) }',
  '  if ($word -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($word) }',
  '  [GC]::Collect()',
  '  [GC]::WaitForPendingFinalizers()',
  '}',
  "Write-Output 'OK'",
].join('\r\n');

// Word costuma levar de 3 a 8 segundos para abrir, converter e fechar.
const TIMEOUT_MS = 60000;

function converterDocxParaPdf(dadosDocx) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ficha-pdf-'));
    const entrada = path.join(dir, 'ficha.docx');
    const saida = path.join(dir, 'ficha.pdf');
    const script = path.join(dir, 'converter.ps1');

    try {
      fs.writeFileSync(entrada, dadosDocx);
      fs.writeFileSync(script, SCRIPT, 'ascii');
    } catch (e) {
      reject(new Error(`Não foi possível preparar a conversão para PDF: ${e.message}`));
      return;
    }

    let concluido = false;
    let relogio = null;
    const removerTemporarios = () => {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* melhor esforço */ }
    };
    const concluir = (erro, pdf) => {
      if (concluido) return;
      concluido = true;
      clearTimeout(relogio);
      removerTemporarios();
      if (erro) reject(erro);
      else resolve(pdf);
    };

    const filho = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', script, '-Entrada', entrada, '-Saida', saida],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stderr = '';
    filho.stderr.on('data', (pedaco) => { stderr += String(pedaco); });

    relogio = setTimeout(() => {
      // Mata a árvore (powershell + o Word que ele abriu) para não deixar um
      // WINWORD.EXE órfão escondido na máquina do usuário.
      spawn('taskkill', ['/PID', String(filho.pid), '/T', '/F'], { windowsHide: true });
      concluir(new Error('A conversão da ficha em PDF demorou mais que o esperado.'));
    }, TIMEOUT_MS);

    filho.on('error', (e) => {
      concluir(new Error(`Não foi possível iniciar o PowerShell para gerar o PDF: ${e.message}`));
    });

    filho.on('close', (codigo) => {
      if (codigo !== 0 || !fs.existsSync(saida)) {
        const detalhe = stderr.trim().split('\n').slice(-1)[0] || '';
        concluir(new Error(`O Microsoft Word não converteu a ficha em PDF.${detalhe ? ` ${detalhe.trim()}` : ''}`));
        return;
      }
      let pdf;
      try {
        pdf = fs.readFileSync(saida);
      } catch (e) {
        concluir(new Error(`Não foi possível ler o PDF gerado: ${e.message}`));
        return;
      }
      if (pdf.length < 5 || pdf.toString('latin1', 0, 5) !== '%PDF-') {
        concluir(new Error('O Microsoft Word devolveu um arquivo que não é um PDF válido.'));
        return;
      }
      concluir(null, pdf);
    });
  });
}

module.exports = { converterDocxParaPdf };
