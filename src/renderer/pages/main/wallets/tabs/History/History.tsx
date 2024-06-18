import { List, Typography, Modal, Divider, Switch, Row, Col } from "antd";
import TransactionElement from "./TransactionElement";
import { useEffect, useState } from "react";
import TransactionDetailsView from "./TransactionDetailsView";
import { useDispatch, useSelector } from "react-redux";
import { useWalletsActiveAccount } from "../../../../../state/wallets/hooks";
import { useTransactions } from "../../../../../state/transactions/hooks";
import { useBlockNumber } from "../../../../../state/application/hooks";
import { Activity2Transaction, AddressActivityFetch, TransactionDetails } from "../../../../../state/transactions/reducer";
import { DBAddressActivitySignal, DB_AddressActivity_Methods } from "../../../../../../main/handlers/DBAddressActivitySingalHandler";
import { IPC_CHANNEL } from "../../../../../config";
import { refreshAddressTimeNodeReward, reloadTransactionsAndSetAddressActivityFetch } from "../../../../../state/transactions/actions";
import "./index.css"
import { AppState } from "../../../../../state";
import { ZERO } from "../../../../../utils/CurrentAmountUtils";
import { fetchAddressAnalytic } from "../../../../../services/address";
import { useWeb3React } from "@web3-react/core";
import { AddressAnalyticVO } from "../../../../../services";
import { TimestampTheStartOf } from "../../../../../utils/DateUtils";
import { TimeNodeRewardSignal, TimeNodeReward_Methods } from "../../../../../../main/handlers/TimeNodeRewardHandler";
import useSafeScan from "../../../../../hooks/useSafeScan";

const { Text } = Typography;

export default () => {

  const { chainId } = useWeb3React();
  const activeAccount = useWalletsActiveAccount();
  const transactions = useTransactions(activeAccount);
  const [clickTransaction, setClickTransaction] = useState<TransactionDetails>();
  const [showNodeReward, setShowNodeReward] = useState<boolean>(true);
  const dispatch = useDispatch();
  const latestBlockNumber = useBlockNumber();
  const addressActivityFetch = useSelector<AppState, AddressActivityFetch | undefined>(state => state.transactions.addressActivityFetch);
  const { URL , API } = useSafeScan();

  useEffect(() => {
    const addressActivtiesLoadActivities = DB_AddressActivity_Methods.loadActivities;
    const timeNodeRewardsGetAll = TimeNodeReward_Methods.getAll;

    if (activeAccount && chainId) {
      if (activeAccount != addressActivityFetch?.address) {
        window.electron.ipcRenderer.sendMessage(IPC_CHANNEL, [DBAddressActivitySignal, addressActivtiesLoadActivities, [activeAccount]]);
      }
      window.electron.ipcRenderer.sendMessage(IPC_CHANNEL, [TimeNodeRewardSignal, timeNodeRewardsGetAll, [activeAccount, chainId]]);

      return window.electron.ipcRenderer.on(IPC_CHANNEL, (arg) => {
        if (arg instanceof Array && arg[0] == DBAddressActivitySignal && arg[1] == addressActivtiesLoadActivities) {
          const rows = arg[2][0];
          console.log(`Load [${activeAccount}] AddressActivities From DB : `, rows);
          let dbStoredRange = {
            start: latestBlockNumber,
            end: 1
          };
          const txns = rows.map((row: any) => {
            const { timestamp, block_number } = row;
            if (timestamp) {
              dbStoredRange.start = Math.min(dbStoredRange.start, block_number);
              dbStoredRange.end = Math.max(dbStoredRange.end, block_number);
            }
            return Activity2Transaction(row);
          });
          dispatch(reloadTransactionsAndSetAddressActivityFetch({
            txns,
            addressActivityFetch: {
              address: activeAccount,
              blockNumberStart: dbStoredRange.end,
              blockNumberEnd: latestBlockNumber == 0 ? 99999999 : latestBlockNumber,
              current: 1,
              pageSize: 200,
              status: 0,
              dbStoredRange
            }
          }));
        }
        if (arg instanceof Array && arg[0] == TimeNodeRewardSignal && arg[1] == timeNodeRewardsGetAll) {
          const rows = arg[2][0];
          const dbTimeNodeRewardMap: {
            [time in string]: string
          } = {};
          console.log(`Load [${activeAccount}] Node Rewards From DB : `, rows);
          const dbTimeNodeRewards = rows.map((row: any) => {
            dbTimeNodeRewardMap[row.time_key] = row.amount;
            return {
              ...row,
              time: row.time_key,
              rewardAmount: row.amount,
              rewardCount: row.count,
            }
          });
          // 将加载的 DB 数据更新到 state
          dispatch(refreshAddressTimeNodeReward({
            chainId,
            address: activeAccount,
            nodeRewards: dbTimeNodeRewards
          }));
          // 远程访问浏览器接口,获取新的数据
          fetchAddressAnalytic( API , { address: activeAccount.toLocaleLowerCase() })
            .then((data: AddressAnalyticVO) => {
              const nodeRewards = data.nodeRewards;
              console.log(`Query-API [${activeAccount}] Node Rewards : `, nodeRewards);
              if (nodeRewards) {
                dispatch(refreshAddressTimeNodeReward({
                  chainId,
                  address: activeAccount,
                  nodeRewards: data.nodeRewards
                }));
                // 将访问的数据更新到数据库
                const method = TimeNodeReward_Methods.saveOrUpdate;
                const saveOrUpdateNodeRewards = nodeRewards.filter(nodeReward => {
                  const { time, rewardAmount } = nodeReward;
                  const _time = time.split(" ")[0];
                  if (!dbTimeNodeRewardMap[_time]) {
                    return true;
                  }
                  if (dbTimeNodeRewardMap[_time] && dbTimeNodeRewardMap[_time] != rewardAmount) {
                    return true;
                  }
                  return false;
                }).map(nodeReward => {
                  return {
                    address: activeAccount,
                    amount: nodeReward.rewardAmount,
                    count: nodeReward.rewardCount,
                    time: nodeReward.time.split(" ")[0]
                  }
                })
                console.log("SaveOrUpdate TimeNodeRewards => ", saveOrUpdateNodeRewards)
                window.electron.ipcRenderer.sendMessage(IPC_CHANNEL, [TimeNodeRewardSignal, method, [
                  saveOrUpdateNodeRewards
                  , chainId]]);
              }
            })
        }
      });
    }

  }, [activeAccount, chainId])

  const walletTab = useSelector<AppState, string | undefined>(state => state.application.control.walletTab);
  useEffect(() => {
    const appContainer = document.getElementById("appContainer");
    if (appContainer) {
      appContainer.scrollTop = 0;
    }
  }, [walletTab])

  return <>
    <Row style={{ marginBottom: "20px" }}>
      <Col span={24}>
        <Switch checkedChildren="开启" unCheckedChildren="关闭" value={showNodeReward} style={{ float: "left" }}
          onChange={setShowNodeReward} />
        <Text style={{ marginLeft: "5px", float: "left" }}>显示挖矿奖励</Text>
      </Col>
    </Row>
    {
      Object.keys(transactions).sort((d1, d2) => TimestampTheStartOf(d2) - TimestampTheStartOf(d1))
        .map(date => {
          const systemRewardAmount = transactions[date].systemRewardAmount;
          return (<div key={date}>
            {
              (transactions[date].transactions.length > 0 || (systemRewardAmount.greaterThan(ZERO) && showNodeReward)) &&
              <>
                <Text type="secondary">{date}</Text>
                <br />
              </>
            }
            {
              systemRewardAmount.greaterThan(ZERO) && showNodeReward && <>
                <Divider dashed style={{ marginTop: "5px", marginBottom: "5px" }} />
                <Text strong style={{ color: "#104499" }}>挖矿奖励  +{systemRewardAmount.toFixed(6)} SAFE</Text>
                <Divider dashed style={{ marginTop: "5px", marginBottom: "20px" }} />
              </>
            }
            {
              transactions[date].transactions.length > 0 && <List
                style={{
                  marginTop: "5px", marginBottom: "5px"
                }}
                bordered
                itemLayout="horizontal"
                dataSource={transactions[date].transactions}
                renderItem={(item, index) => {
                  return <TransactionElement setClickTransaction={setClickTransaction} transaction={item} />
                }}
              />
            }
          </div>)
        })
    }

    <Modal title="交易明细" closable footer={null} open={clickTransaction != null} onCancel={() => setClickTransaction(undefined)}>
      <Divider />
      {clickTransaction && <TransactionDetailsView transaction={clickTransaction} />}
    </Modal>

  </>

}
