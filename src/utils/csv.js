// separador: ';' por padrão (padrão do projeto); aceita ',' para arquivos
// salvos pelo Excel em locale que usa vírgula. O cabeçalho é plano (nomes
// de campo sem vírgula/semicolon dentro), então dá para detectar fora.
function parseCsv(texto, separador = ';') {
  const linhas = [];
  let campo = '';
  let linha = [];
  let dentroDeAspas = false;
  const bruto = String(texto || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < bruto.length; i++) {
    const c = bruto[i];
    if (dentroDeAspas) {
      if (c === '"') {
        if (bruto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      dentroDeAspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas;
}

module.exports = { parseCsv };
