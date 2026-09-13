export function tradeView(plan,simulation,execution){
 const prepared=!!plan&&plan.receipts.length===plan.steps.length;
 return {phase:!plan?0:prepared?2:1,choose:!plan,review:!!plan,setup:!!plan&&!prepared&&!execution,execute:prepared&&!execution,receipt:!!execution,preview:prepared&&!simulation&&!execution,broadcast:prepared&&!!simulation&&!execution};
}
