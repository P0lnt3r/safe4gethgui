import { LockOutlined } from "@ant-design/icons";
import { Button, Card, Col, Divider, Modal, Row, Typography } from "antd"
import { Supernode_Create_Type_NoUnion, Supernode_create_type_Union } from "./SupernodeRegister";
import { useCallback, useState } from "react";
import { useTransactionAdder } from "../../../../state/transactions/hooks";
import useTransactionResponseRender from "../../../components/useTransactionResponseRender";
import { useWalletsActiveAccount } from "../../../../state/wallets/hooks";
import { useSupernodeLogicContract } from "../../../../hooks/useContracts";
import { ethers } from "ethers";
import { TransactionResponse } from "@ethersproject/providers";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { applicationUpdateWalletTab } from "../../../../state/application/action";

const { Text } = Typography;

export default ({
  openCreateModal, setOpenCreateModal,
  createParams,
}: {
  openCreateModal: boolean,
  setOpenCreateModal: (openCreateModal: boolean) => void,
  createParams: {
    createType: number
    name: string | undefined,
    enode: string | undefined,
    description: string | undefined,
    incentivePlan: {
      creator: number,
      voter: number,
      partner: number
    }
  }
}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { createType } = createParams;
  const [sending, setSending] = useState<boolean>(false);
  const {
    render,
    setTransactionResponse,
    setErr
  } = useTransactionResponseRender();
  const addTransaction = useTransactionAdder();
  const activeAccount = useWalletsActiveAccount();
  const supernodeLogicContract = useSupernodeLogicContract(true);

  const doCreateSupernode = useCallback(() => {
    if (activeAccount && supernodeLogicContract) {
      const { createType, name, enode, description, incentivePlan } = createParams;
      // function register(bool _isUnion, address _addr, uint _lockDay, string memory _name, string memory _enode, string memory _description,
      //                    uint _creatorIncentive, uint _partnerIncentive, uint _voterIncentive) external payable;
      const value = ethers.utils.parseEther(
        Supernode_create_type_Union == createType ? "1000" : "5000"
      );
      setSending(true);
      supernodeLogicContract.register(
        Supernode_create_type_Union == createType,
        activeAccount,
        720,
        name, enode, description,
        incentivePlan.creator, incentivePlan.partner, incentivePlan.voter,
        {
          value,
          gasLimit: 1000000
        }
      ).then((response: TransactionResponse) => {
        const { hash, data } = response;
        addTransaction({ to: supernodeLogicContract.address }, response, {
          call: {
            from: activeAccount,
            to: supernodeLogicContract.address,
            input: data,
            value: value.toString()
          }
        });
        setTxHash(hash);
        setSending(false);
        setTransactionResponse(response);
      }).catch((err: any) => {
        setSending(false);
        setErr(err)
      });

    }
  }, [activeAccount, supernodeLogicContract, createParams]);

  const [txHash, setTxHash] = useState<string>();
  const cancel = useCallback(() => {
    setOpenCreateModal(false);
    if (txHash) {
      setTxHash(undefined);
      dispatch(applicationUpdateWalletTab("history"));
      navigate("/main/wallet");
    }
  }, [txHash])

  return <Modal title="创建超级节点" open={openCreateModal} footer={null} destroyOnClose onCancel={cancel}>
    <Divider />
    {
      render
    }
    <Row>
      <Col span={24}>
        <LockOutlined style={{ fontSize: "32px" }} />
        {
          createType == Supernode_Create_Type_NoUnion &&
          <Text strong style={{ fontSize: "32px", marginLeft: "5px" }}>5,000 SAFE</Text>
        }
        {
          createType == Supernode_create_type_Union &&
          <Text strong style={{ fontSize: "32px", marginLeft: "5px" }}>1,000 SAFE</Text>
        }
      </Col>
    </Row>
    <br />
    <Row>
      <Col span={24}>
        <Text type="secondary">从</Text>
      </Col>
      <Col span={24} style={{ paddingLeft: "5px" }} >
        <Text>普通账户</Text>
      </Col>
    </Row>
    <br />
    <Row>
      <Col span={24}>
        <Text type="secondary">到</Text>
      </Col>
      <Col span={24} style={{ paddingLeft: "5px" }} >
        <Text>锁仓账户</Text>
      </Col>
    </Row>
    <Divider />
    <Card size="small">
      <Row>
        <Col span={24}>
          <Text type="secondary">超级节点名称</Text>
        </Col>
        <Col span={24}>
          <Text>{createParams.name}</Text>
        </Col>
        <Divider style={{ margin: "8px 0px" }} />
      </Row>
      <Row>
        <Col span={24}>
          <Text type="secondary">超级节点ENODE</Text>
        </Col>
        <Col span={24}>
          <Text>{createParams.enode}</Text>
        </Col>
        <Divider style={{ margin: "8px 0px" }} />
      </Row>
      <Row>
        <Col span={24}>
          <Text type="secondary">超级节点简介</Text>
        </Col>
        <Col span={24}>
          <Text>{createParams.description}</Text>
        </Col>
      </Row>
    </Card>
    <Divider />
    <Row style={{ width: "100%", textAlign: "right" }}>
      <Col span={24}>
        {
          !sending && !render && <Button icon={<LockOutlined />} onClick={() => {
            doCreateSupernode();
          }} disabled={sending} type="primary" style={{ float: "right" }}>
            发送交易
          </Button>
        }
        {
          sending && !render && <Button loading disabled type="primary" style={{ float: "right" }}>
            发送中....
          </Button>
        }
        {
          render && <Button onClick={cancel} type="primary" style={{ float: "right" }}>
            关闭
          </Button>
        }
      </Col>
    </Row>

  </Modal>
}
