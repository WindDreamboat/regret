/** 伴侣人设，由用户自由填写 */
export interface Persona {
  /** 伴侣的名字 */
  name: string
  /** 伴侣对用户的称呼 */
  userAddress: string
  /** 性格描述 */
  personality: string
  /** 背景故事 */
  background: string
}

/** 全字段为空的人设，用作初始值 */
export const EMPTY_PERSONA: Persona = {
  name: '',
  userAddress: '',
  personality: '',
  background: '',
}
