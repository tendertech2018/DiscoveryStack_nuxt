import { handleReadiness } from '../operations/http'

export default defineEventHandler(event => handleReadiness(event))
