import {resolveControlledOwnerDatabaseUserId} from '../audit/repository'
import {weeklyFeatureEnabled} from '../weekly-content/http'
import {isWeeklyLineConfigurationReady} from '../weekly-content/runtime-line'
import {runWeeklyContentTick} from '../weekly-content/runtime'
import {runOperationsTask} from '../operations/task-heartbeats'
export default defineTask({meta:{name:'weekly-content:tick',description:'Prepare one weekly customer article, queue LINE review and publish only exact customer-approved content.'},async run(){
 return runOperationsTask('weekly-content:tick',async()=>{
  if(!weeklyFeatureEnabled() || process.env.NUXT_CONTENT_OPERATIONS_SCHEDULER_ENABLED!=='true')return {result:{status:'disabled',processed:0}}
  if(!isWeeklyLineConfigurationReady())return {result:{status:'not_configured',processed:0}}
  const config=useRuntimeConfig()
  const ownerUserId=await resolveControlledOwnerDatabaseUserId(String(config.ownerOpenId || process.env.OWNER_OPEN_ID || ''))
  return {result:await runWeeklyContentTick({ownerUserId,maxClients:10})}
 })
}})
