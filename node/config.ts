import rawConfig from '../config.json'

export type SearchEngine = 'gopersonal' | 'vtex'

export type AppConfig = {
  gopersonal: {
    baseUrl: string
    limit: number
  }
}

export const config: AppConfig = rawConfig as AppConfig
