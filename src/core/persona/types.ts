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

/** 全字段为空的人设，用作损坏数据的兜底值 */
export const EMPTY_PERSONA: Persona = {
  name: '',
  userAddress: '',
  personality: '',
  background: '',
}

/**
 * 首次进入时的默认人设。
 *
 * 冷启动若面对空白界面会直接丢掉用户（需求 7.3），因此给一个具名、可对话的
 * 初始人设；用户可在人设页改成任意内容。仅当本地无任何已保存人设时使用。
 */
export const DEFAULT_PERSONA: Persona = {
  name: '小满',
  userAddress: '你',
  personality: '温和、爱吐槽、偶尔嘴硬，但很在意你',
  background: '在一家旧书店工作，喜欢雨天和热咖啡',
}
