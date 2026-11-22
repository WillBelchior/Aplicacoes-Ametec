/* Exportador privado de planilha .xlsx. Não transmite dados para serviços externos. */
(function(){
"use strict";
const encoder=new TextEncoder();
const escapeXml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"");
function col(n){let x="";while(n){n--;x=String.fromCharCode(65+n%26)+x;n=Math.floor(n/26);}return x;}
const crcTable=Array.from({length:256},(_,i)=>{
  for(let k=0;k<8;k++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;
  return i>>>0;
});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(files){
  const chunks=[],central=[];let size=0;
  const w16=n=>[n&255,n>>>8&255],w32=n=>[n&255,n>>>8&255,n>>>16&255,n>>>24&255];
  for(const [path,value] of files){
    const name=encoder.encode(path),body=encoder.encode(value),crc=crc32(body);
    const header=Uint8Array.from([...w32(0x04034b50),...w16(20),...w16(0x0800),...w16(0),
      ...w16(0),...w16(0),...w32(crc),...w32(body.length),...w32(body.length),...w16(name.length),...w16(0)]);
    chunks.push(header,name,body);
    central.push({name,bodySize:body.length,crc,start:size});
    size+=header.length+name.length+body.length;
  }
  const centralStart=size;
  for(const f of central){
    const entry=Uint8Array.from([...w32(0x02014b50),...w16(20),...w16(20),
      ...w16(0x0800),...w16(0),...w16(0),...w16(0),...w32(f.crc),
      ...w32(f.bodySize),...w32(f.bodySize),...w16(f.name.length),...w16(0),
      ...w16(0),...w16(0),...w16(0),...w32(0),...w32(f.start)]);
    chunks.push(entry,f.name);size+=entry.length+f.name.length;
  }
  chunks.push(Uint8Array.from([...w32(0x06054b50),...w16(0),...w16(0),
    ...w16(central.length),...w16(central.length),
    ...w32(size-centralStart),...w32(centralStart),...w16(0)]));
  return new Blob(chunks,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}
function worksheet(headers,rows){
  const values=[headers,...rows],lastCol=col(headers.length);
  const colMarkup=headers.map((h,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+
    '" width="'+Math.min(42,Math.max(13,String(h).length+4))+'" customWidth="1"/>').join("");
  const data=values.map((row,r)=>{
    const cells=row.map((v,c)=>{
      if(v===null||v===undefined||v==="")return "";
      const address=col(c+1)+(r+1),style=r===0?' s="1"':"";
      return typeof v==="number"&&Number.isFinite(v)?
        '<c r="'+address+'"'+style+'><v>'+v+'</v></c>':
        '<c r="'+address+'"'+style+' t="inlineStr"><is><t>'+escapeXml(v)+'</t></is></c>';
    }).join("");
    return '<row r="'+(r+1)+'"'+(r===0?' ht="24" customHeight="1"':'')+'>'+cells+'</row>';
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
    '<sheetFormatPr defaultRowHeight="17"/><cols>'+colMarkup+'</cols><sheetData>'+data+'</sheetData>'+
    '<autoFilter ref="A1:'+lastCol+values.length+'"/></worksheet>';
}
function create(headers,rows){
  if(!Array.isArray(headers)||!headers.length||headers.length>30||
     !Array.isArray(rows)||rows.some(row=>!Array.isArray(row)||row.length>headers.length))
    throw Error("Dados inválidos para exportação XLSX.");
  const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
    '<Default Extension="xml" ContentType="application/xml"/>'+
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'+
    '</Types>';
  const rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'+
    '</Relationships>';
  const book='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'+
    ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<sheets><sheet name="Atendimentos" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const bookRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'+
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'+
    '</Relationships>';
  const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="2"><font><sz val="11"/><name val="Aptos"/></font>'+
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>'+
    '<fills count="3"><fill><patternFill patternType="none"/></fill>'+
    '<fill><patternFill patternType="gray125"/></fill>'+
    '<fill><patternFill patternType="solid"><fgColor rgb="FF24466B"/><bgColor indexed="64"/></patternFill></fill></fills>'+
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'+
    '</styleSheet>';
  return zip([
    ["[Content_Types].xml",types],["_rels/.rels",rels],["xl/workbook.xml",book],
    ["xl/_rels/workbook.xml.rels",bookRels],["xl/styles.xml",styles],
    ["xl/worksheets/sheet1.xml",worksheet(headers,rows)]
  ]);
}
function download(headers,rows,fileName="historico-atendimentos.xlsx"){
  const url=URL.createObjectURL(create(headers,rows));
  const a=document.createElement("a");
  a.href=url;a.download=fileName.endsWith(".xlsx")?fileName:fileName+".xlsx";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.BarquinhaAttendanceXlsx={create,download};
})();