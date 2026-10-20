import {createHash} from 'node:crypto'
import manifest from '@/docs/agent-skills/manifest.json'

export type AgentMode = 'preflight' | 'inspect'
export type AgentCommand = {number:number; name:string; shortcut:string; sop_title:string; mode:string}
export type LiveIndexRow = {shortcut:string; sequence:string; sopUrl:string; status:string}
export type SourceDocument = {id:string; name:string; mimeType:string; modifiedTime:string; text:string}
export type IndexSnapshot = {id:string; modifiedTime:string; rows:LiveIndexRow[]}
export type SopSource = {
  readIndex():Promise<IndexSnapshot>
  readSop(url:string):Promise<SourceDocument>
  readIndexRevision():Promise<string>
  readSopRevision(id:string):Promise<string>
}
export type GateDecision = {
  ok:boolean; code:string; commandId:number; command:string; mode:AgentMode;
  sop?:{fileId:string;modifiedAt:string;sha256:string;indexModifiedAt:string}
}
const allCommands:AgentCommand[]=manifest.shortcuts
export const READ_ONLY_INSPECT_IDS = [2,4,13,14] as const
export class AgentGateError extends Error {
  constructor(public code:string){super(code)}
}
export function resolveCommand(id:unknown):AgentCommand{
  if(typeof id!=='number'||!Number.isInteger(id))throw new AgentGateError('BLOCK_UNKNOWN_COMMAND')
  const command=allCommands.find(c=>c.number===id)
  if(!command)throw new AgentGateError('BLOCK_UNKNOWN_COMMAND')
  return command
}
export function validateAction(command:AgentCommand,mode:AgentMode):void{
  if(mode!=='preflight'&&mode!=='inspect')throw new AgentGateError('BLOCK_INVALID_MODE')
  if(mode==='inspect'&&(!READ_ONLY_INSPECT_IDS.includes(command.number as 2|4|13|14)||command.mode!=='read_only'))
    throw new AgentGateError('BLOCK_ACTION_NOT_READ_ONLY')
}
export function sopIdFromUrl(url:string):string{
  try{
    const parsed=new URL(url)
    if(!['docs.google.com','drive.google.com'].includes(parsed.hostname)||parsed.protocol!=='https:')
      throw new Error('non google')
    const match=parsed.pathname.match(/^\/(?:document|file)\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/)
    if(!match)throw new Error('invalid path')
    return match[1]
  }catch{throw new AgentGateError('BLOCK_SOP_LINK_INVALID')}
}
const disallowedStatus=/(archive|obsolete|รอตรวจทาน|ยกเลิก|ยุติ|draft|review only)/i
export async function evaluateSopGate(id:number,mode:AgentMode,source:SopSource):Promise<GateDecision>{
  const command=resolveCommand(id)
  validateAction(command,mode)
  const base={commandId:id,command:command.shortcut,mode}
  try {
    const index=await source.readIndex()
    if(!index?.modifiedTime||!Array.isArray(index.rows))throw new AgentGateError('BLOCK_INDEX_UNREADABLE')
    const matches=index.rows.filter(r=>r.shortcut===command.shortcut&&Number(r.sequence)===id)
    if(matches.length!==1)throw new AgentGateError('BLOCK_SOP_NOT_FOUND')
    const row=matches[0]
    if(!row.sopUrl||disallowedStatus.test(row.status))throw new AgentGateError('BLOCK_SOP_NOT_APPROVED')
    const expectedId=sopIdFromUrl(row.sopUrl)
    const sop=await source.readSop(row.sopUrl)
    if(sop.id!==expectedId||!sop.modifiedTime||!sop.name||!sop.text.trim())
      throw new AgentGateError('BLOCK_SOP_UNREADABLE')
    if(!['application/vnd.google-apps.document','text/plain','text/markdown'].includes(sop.mimeType))
      throw new AgentGateError('BLOCK_SOP_UNREADABLE')
    if(sop.name!==command.sop_title)
      throw new AgentGateError('BLOCK_SOP_TITLE_CONFLICT')
    const [currentIndexRevision,currentSopRevision]=await Promise.all([
      source.readIndexRevision(),source.readSopRevision(sop.id)
    ])
    if(index.modifiedTime!==currentIndexRevision||sop.modifiedTime!==currentSopRevision)
      throw new AgentGateError('BLOCK_SOP_REVISION_CHANGED')
    return {...base,ok:true,code:mode==='inspect'?'PASS_READ_ONLY':'PASS_PREFLIGHT_ONLY',
      sop:{fileId:sop.id,modifiedAt:sop.modifiedTime,sha256:createHash('sha256').update(sop.text).digest('hex'),
        indexModifiedAt:index.modifiedTime}}
  }catch(e){
    return {...base,ok:false,code:e instanceof AgentGateError?e.code:'BLOCK_SOP_SOURCE_UNAVAILABLE'}
  }
}
