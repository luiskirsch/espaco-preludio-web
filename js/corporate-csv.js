// Small CSV codec shared by the HR screen and its data-integrity tests.
export function parseRosterCsv(source) {
  if (typeof source !== 'string' || source.length > 262144) throw new Error('Arquivo muito grande. O limite é 256 KB.');
  source = source.replace(/^\uFEFF/, '');
  const headerLine = source.split(/\r?\n/)[0];
  const delimiters = [';', ',', '\t'];
  const delimiter = delimiters.sort((a,b) => headerLine.split(b).length-headerLine.split(a).length)[0];
  const rows = [], row = []; let cell = '', quoted = false, closed = false;
  for (let i=0;i<=source.length;i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i+1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else if (c === undefined) throw new Error('CSV inválido: aspas não fechadas.');
      else cell += c;
    } else if (c === delimiter || c === '\n' || c === '\r' || c === undefined) {
      row.push(cell.trim()); cell=''; closed=false;
      if (c !== delimiter) {
        if (row.some(value => value)) rows.push(row.splice(0)); else row.splice(0);
        if (c === '\r' && source[i+1] === '\n') i++;
      }
    } else if (c === '"' && !cell && !closed) quoted=true;
    else { if (closed || c === '"') throw new Error('CSV inválido: confira os separadores e as aspas.'); cell+=c; }
  }
  if (rows.length < 2) throw new Error('Inclua o cabeçalho e pelo menos um colaborador.');
  if (rows.length > 101) throw new Error('Importe até 100 colaboradores por arquivo.');
  const aliases = { nome:'nome', name:'nome', nomecompleto:'nome', email:'email', telefone:'telefone', departamento:'departamento', cargo:'cargo',
    employmenttype:'employmentType', tipodevinculo:'employmentType', vinculo:'employmentType', admissiondate:'admissionDate', datadeadmissao:'admissionDate', admissao:'admissionDate' };
  const headers = rows.shift().map(value => aliases[value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\s_-]/g,'')]);
  if (!headers.includes('nome') || !headers.includes('email')) throw new Error('O cabeçalho precisa conter nome e email.');
  const known = headers.filter(Boolean);
  if (new Set(known).size !== known.length) throw new Error('Há colunas repetidas no cabeçalho.');
  return rows.map((values,i) => {
    if (values.length !== headers.length) throw new Error(`Linha ${i+2}: quantidade de colunas diferente do cabeçalho.`);
    return Object.fromEntries(headers.flatMap((key,index) => key ? [[key,values[index]]] : []));
  });
}
export function rosterCsv(headers, rows) {
  // Quotes alone do not stop spreadsheet formulas. Prefix dangerous cells before quoting.
  const encode = value => { let s=String(value ?? ''); if (/^[\s]*[=+@\-\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; };
  return '\uFEFF'+[headers,...rows].map(row=>row.map(encode).join(';')).join('\r\n');
}
