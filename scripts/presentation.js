// Apply the same presentation metadata to checked-in and migrated networks.
export function applyPresentation(data){
  data.ui.unofficial=['trtc','newisle'].includes(data.id);
  data.options.criteria=data.options.criteria.filter(value=>value!=='transferTime');
  const links=data.sources.links;
  if(data.id==='trtc'){
    links.en[0]={text:'Taipei Metro website',url:'https://english.metro.taipei/'};
    links.zh[0]={text:'台北捷運官網',url:'https://www.metro.taipei/'};
    links.ja=[{text:'台北メトロ公式サイト',url:'https://www.metro.taipei/'}];
    data.footer={description:{
      en:'Travel times do not include any waiting time for trains. Route estimates are for reference only.',
      zh:'旅程時間完全不考慮等車時間，路線查詢結果僅供參考。',
      ja:'所要時間には列車の待ち時間を一切含みません。経路検索の結果は参考情報です。',
    }};
  }else{
    links.ja=[{...links.en[0],text:data.id==='newisle'?'Newisle をダウンロード':'ワールドをダウンロード'},...links.en.slice(1)];
  }
  if(data.id.startsWith('ftmc'))data.sources.wikiSearchUrl='https://flashteens.fandom.com/wiki/Special:Search';
  return data;
}
