// A fresh, portable document for the editor; never part of the public registry.
export function createBlankNetwork() {
  return {
    schemaVersion:2,id:'_blank',names:{en:'(Blank map)',zh:'(空白地圖)'},preview:false,
    stations:{},lines:{},edges:[],aliases:{},
    ui:{enableDistance:true,enableFare:false},map:{cornerRadius:12,parallelGap:5},
    options:{defaults:{criteria:'time',transferCoef:1},criteria:['time','transfers','stops','mixed'],transferCoefficients:[1,4,7],comparators:{
      time:[{timeSec:1},{transfers:1},{stops:1}],
      transfers:[{transfers:1},{timeSec:1},{stops:1}],
      stops:[{stops:1},{timeSec:1},{transfers:1}],
      mixed:[{transfers:1,timeSec:.05,transferTimeSec:.1,stops:.2},{timeSec:1}]
    }},fares:{type:'free',currency:null},footer:{description:{en:'',zh:'',ja:''}}
  };
}
