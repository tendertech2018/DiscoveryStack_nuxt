import { handleLiveness } from '../operations/http'

export default defineEventHandler(event => handleLiveness(event))
