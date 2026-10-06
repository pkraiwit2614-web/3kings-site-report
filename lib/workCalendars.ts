export type WorkCalendar={id:string;label:string;color:string}

export const WORK_CALENDARS:WorkCalendar[]=[
  {id:'family17900518303332507254@group.calendar.google.com',label:'3 Kings – Construction Plan',color:'#b99aff'},
  {id:'9fad4dc9a66ea28e8e98f833119dbd8a4978b66574a329f2d9d1bb8d71b7f498@group.calendar.google.com',label:'3 Kings – Site / Actual',color:'#ff7537'},
  {id:'6cf6a83e431fa95467563ac0e82400d126601d3e6d3c76936ee26de0813e3614@group.calendar.google.com',label:'กำหนดส่ง-ของเข้าหน้างาน',color:'#a47ae2'},
  {id:'9b7068d0a450c0f2acbc58783d9eabf80c2957b329d99bdbb1078586994ac210@group.calendar.google.com',label:'3K - Above Villa 6',color:'#c2c2c2'},
  {id:'7ca8d4a9ade6e05b36ec81c9e0dc025d12c567541414a9ceaee1958e344d187c@group.calendar.google.com',label:'3K - Above Villa 7',color:'#ff7537'},
  {id:'d31b1dafb3231456407795ea8400bdc0daf490553d441449312e01725a7fd379@group.calendar.google.com',label:'3K - Above Villa 8',color:'#cca6ac'},
  {id:'958f698c143282cd3a24c4d8563e2fbe505a8c1948f91806b3480ea1a25450f9@group.calendar.google.com',label:'3K - Above Villa 9',color:'#b3dc6c'},
]

export const WORK_CALENDAR_IDS=new Set(WORK_CALENDARS.map(row=>row.id))

export function getWorkCalendar(id:string){
  return WORK_CALENDARS.find(row=>row.id===id)||null
}
