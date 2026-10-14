import { jsPDF } from "jspdf";
import type { ReportData } from "@/components/common/ReportButton";

export function buildReportSummaryPdf(data: ReportData, options: {title: string; filters?: string[]}) {
  const pdf = new jsPDF({orientation: "landscape",unit: "mm",format: data.headers.length > 12 ? "a3" : "a4"});
  const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
  const margin = 12, width = w - margin * 2, bottom = h - 14;
  let y = 30;
  const chrome = () => {
    pdf.setFillColor(7,16,21);pdf.rect(0,0,w,22,"F");
    pdf.setFillColor(0,165,125);pdf.rect(0,22,w/2,1.2,"F");
    pdf.setFillColor(232,35,101);pdf.rect(w/2,22,w/2,1.2,"F");
    pdf.setTextColor(255);pdf.setFont("helvetica","bold");pdf.setFontSize(15);pdf.text("sistemaintegral",margin,12);
    pdf.setFont("helvetica","normal");pdf.setFontSize(7);pdf.text("RELATÓRIO SIMPLIFICADO",margin,18);
    pdf.setFontSize(9);pdf.text(pdf.splitTextToSize(options.title,w/2-20).slice(0,2),w-margin,10,{align:"right"});
    y=30;
  };
  const page = () => {pdf.addPage();chrome();};
  chrome();
  pdf.setTextColor(40);pdf.setFontSize(8);
  for(const filter of options.filters ?? []) {
    const lines = pdf.splitTextToSize(filter,width) as string[];
    for(const line of lines) {if(y+5>bottom)page();pdf.setTextColor(60);pdf.text(line,margin,y);y+=4;}
  }
  y+=3;
  for(const entry of data.highlights ?? []) {
    const text=pdf.splitTextToSize(`${entry.label}: ${entry.value}`,width-8) as string[];
    const height=text.length*4+6;
    if(y+height>bottom)page();
    pdf.setFillColor(242,247,246);pdf.roundedRect(margin,y,width,height,1.5,1.5,"F");
    pdf.setTextColor(15,45,40);pdf.setFontSize(8);pdf.text(text,margin+4,y+5);y+=height+2;
  }
  y+=4;
  const weights=data.headers.map(header=>/produto|cliente/i.test(header)?2.1:/vendedor|pagamento|rastreio/i.test(header)?1.5:/total|pago|receber|frete|custo|lucro/i.test(header)?1.6:1);
  const total=weights.reduce((sum,value)=>sum+value,0)||1;
  const widths=weights.map(value=>width*value/total);
  const lineHeight=3.5, padding=2;
  const wrap=(cells: unknown[],bold=false)=>{
    pdf.setFont("helvetica",bold?"bold":"normal");pdf.setFontSize(7.5);
    return data.headers.map((_,index)=>pdf.splitTextToSize(String(cells[index]??"—"),Math.max(6,(widths[index]??10)-padding*2)) as string[]);
  };
  const headerLines=wrap(data.headers,true);
  const headerHeight=Math.max(8,...headerLines.map(lines=>lines.length*lineHeight+4));
  const drawHeader=()=>{
    if(y+headerHeight+8>bottom)page();
    pdf.setFillColor(16,39,48);pdf.rect(margin,y,width,headerHeight,"F");
    pdf.setTextColor(255);pdf.setFont("helvetica","bold");pdf.setFontSize(7.5);
    let x=margin;headerLines.forEach((lines,index)=>{pdf.text(lines,x+padding,y+4);x+=widths[index]??0;});y+=headerHeight;
  };
  drawHeader();
  for(const [rowIndex,row] of data.rows.entries()) {
    const cells=wrap(row);const count=Math.max(1,...cells.map(lines=>lines.length));
    let offset=0;
    while(offset<count) {
      const fullHeight=(count-offset)*lineHeight+4;
      if(y+fullHeight>bottom && fullHeight<bottom-30-headerHeight){page();drawHeader();}
      const capacity=Math.floor((bottom-y-4)/lineHeight);
      if(capacity<1){page();drawHeader();continue;}
      const take=Math.min(capacity,count-offset), height=take*lineHeight+4;
      pdf.setFillColor(...(rowIndex%2?[248,250,250]:[237,244,242]) as [number,number,number]);pdf.rect(margin,y,width,height,"F");
      pdf.setTextColor(30,41,45);pdf.setFont("helvetica","normal");pdf.setFontSize(7.5);
      let x=margin;cells.forEach((lines,index)=>{const part=lines.slice(offset,offset+take);if(part.length)pdf.text(part,x+padding,y+4);x+=widths[index]??0;});
      pdf.setDrawColor(215,226,222);pdf.line(margin,y+height,w-margin,y+height);
      y+=height;offset+=take;
      if(offset<count){page();drawHeader();}
    }
  }
  if(!data.rows.length){pdf.setTextColor(70);pdf.text("Sem dados para este relatório.",margin+3,y+7);}
  const pages=pdf.getNumberOfPages();
  for(let page=1;page<=pages;page++){pdf.setPage(page);pdf.setTextColor(100);pdf.setFontSize(7);pdf.text(`Sistema Integral | Resumo | Página ${page} de ${pages}`,w-margin,h-6,{align:"right"});}
  return pdf;
}
