/** 图层列表触发一次选择操作时抛给外层的标准载荷。 */
export interface LayerSelectionPayload {
  /** 当前交互命中的节点 id。 */
  nodeId: string;
  /** 是否在现有选区基础上追加 / 取消该节点。 */
  appendToSelection: boolean;
}
