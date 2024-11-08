


import { Typography, Button, Row, Col, Modal, Space, Alert, Input } from 'antd';
import { useMasternodeStorageContract, useMulticallContract } from '../../../hooks/useContracts';
import { useCallback, useEffect, useState } from 'react';
import { MasternodeInfo, formatMasternode } from '../../../structs/Masternode';
import Table, { ColumnsType } from 'antd/es/table';
import { CurrencyAmount, JSBI } from '@uniswap/sdk';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { applicationControlAppendMasternode, applicationControlUpdateEditMasternodeId } from '../../../state/application/action';
import { useWalletsActiveAccount } from '../../../state/wallets/hooks';
import { RenderNodeState } from '../supernodes/Supernodes';
import AddressComponent from '../../components/AddressComponent';
import { Safe4_Business_Config } from '../../../config';
import { useBlockNumber } from '../../../state/application/hooks';
import Masternode from './Masternode';
import useAddrNodeInfo from '../../../hooks/useAddrIsNode';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;
const Masternodes_Page_Size = 10;

export default ({
  queryMyMasternodes,
  queryJoinMasternodes
}: {
  queryMyMasternodes: boolean,
  queryJoinMasternodes: boolean,
}) => {

  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const multicallContract = useMulticallContract();
  const masternodeStorageContract = useMasternodeStorageContract();
  const [loading, setLoading] = useState<boolean>(false);
  const [masternodes, setMasternodes] = useState<MasternodeInfo[]>();
  const [openMasternodeModal, setOpenMasternodeModal] = useState<boolean>(false);
  const [openMasternodeInfo, setOpenMasternodeInfo] = useState<MasternodeInfo>();

  const [queryKey, setQueryKey] = useState<string>();
  const [queryKeyError, setQueryKeyError] = useState<string>();

  const [pagination, setPagination] = useState<{
    total: number | undefined
    pageSize: number | undefined,
    current: number | undefined,
  }>();

  const activeAccount = useWalletsActiveAccount();
  const blockNumber = useBlockNumber();
  const addrNodeInfo = useAddrNodeInfo(activeAccount);
  useEffect(() => {
    if (masternodeStorageContract) {
      if ((pagination && pagination.current && pagination.current > 1)) {
        return;
      }
      if (queryKey) {
        doSearch();
        return;
      }
      if (queryMyMasternodes) {
        // getAddrNum4Creator
        masternodeStorageContract.callStatic.getAddrNum4Creator(activeAccount)
          .then(data => {
            if (data.toNumber() == 0) {
              setMasternodes([]);
            }
            setPagination({
              total: data.toNumber(),
              pageSize: Masternodes_Page_Size,
              current: 1,
            })
          })
      } else if (queryJoinMasternodes) {
        masternodeStorageContract.callStatic.getAddrNum4Partner(activeAccount)
          .then(data => {
            if (data.toNumber() == 0) {
              setMasternodes([]);
            }
            setPagination({
              total: data.toNumber(),
              pageSize: Masternodes_Page_Size,
              current: 1,
            })
          })
      } else {
        // function getNum() external view returns (uint);
        masternodeStorageContract.callStatic.getNum()
          .then(data => {
            if (data.toNumber() == 0) {
              setMasternodes([]);
            }
            setPagination({
              total: data.toNumber(),
              pageSize: Masternodes_Page_Size,
              current: 1,
            })
          })
      }
    }
  }, [masternodeStorageContract, activeAccount, blockNumber, queryKey]);


  useEffect(() => {
    if (pagination && masternodeStorageContract && multicallContract) {
      const { pageSize, current, total } = pagination;
      if (current && pageSize && total) {

        //////////////////// 逆序 ////////////////////////
        let _position = (current - 1) * pageSize;
        let _offset = pageSize;
        /////////////////////////////////////////////////
        //////////////////// 逆序 ////////////////////////
        let position = total - (pageSize * current);
        let offset = pageSize;
        if (position < 0) {
          offset = pageSize + position;
          position = 0;
        }
        //////////////////////////////////////////////////
        if (total == 0) {
          return;
        }

        setLoading(true);
        if (queryMyMasternodes) {
          masternodeStorageContract.callStatic.getAddrs4Creator(activeAccount, position, offset)
            .then((addresses: any) => {
              loadMasternodeInfos(addresses);
            });
        } else if (queryJoinMasternodes) {
          masternodeStorageContract.callStatic.getAddrs4Partner(activeAccount, position, offset)
            .then((addresses: any) => {
              loadMasternodeInfos(addresses);
            });
        } else {
          masternodeStorageContract.callStatic.getAll(position, offset)
            .then((addresses: any) => {
              loadMasternodeInfos(addresses);
            });
        }
      }
    }
  }, [pagination]);

  const loadMasternodeInfos = useCallback((addresses: string[]) => {
    if (masternodeStorageContract && multicallContract) {
      // function getInfo(address _addr) external view returns (MasterNodeInfo memory);
      const fragment = masternodeStorageContract.interface.getFunction("getInfo")
      const calls = addresses.map((address: string) => [
        masternodeStorageContract.address,
        masternodeStorageContract.interface.encodeFunctionData(fragment, [address])
      ])
      multicallContract.callStatic.aggregate(calls)
        .then(data => {
          const masternodes: MasternodeInfo[] = data[1].map((raw: string) => {
            const _masternode = masternodeStorageContract.interface.decodeFunctionResult(fragment, raw)[0];
            return formatMasternode(_masternode);
          });
          if (queryMyMasternodes) {
            const _masternodes = masternodes.filter(masternode => masternode.creator == activeAccount)
              .sort((m0: MasternodeInfo, m1: MasternodeInfo) => m1.id - m0.id);
            setMasternodes(_masternodes);
          } else if (queryJoinMasternodes) {
            const _masternodes = masternodes.filter(masternode => masternode.founders.map(founder => founder.addr).indexOf(activeAccount) > 0)
              .sort((m0: MasternodeInfo, m1: MasternodeInfo) => m1.id - m0.id);
            setMasternodes(_masternodes);
          } else {
            // then set masternodes ...
            setMasternodes(masternodes.sort((m0: MasternodeInfo, m1: MasternodeInfo) => m1.id - m0.id));
          }
          setLoading(false);
        })
    }
  }, [masternodeStorageContract, multicallContract, queryJoinMasternodes, queryMyMasternodes, activeAccount])

  const columns: ColumnsType<MasternodeInfo> = [
    {
      title: t("wallet_masternodes_state"),
      dataIndex: 'state',
      key: 'state',
      render: (state) => {
        return <>
          <Row>
            <Col span={20}>
              {RenderNodeState(state, t)}
            </Col>
          </Row>
        </>
      },
    },
    {
      title: t("wallet_masternodes_id"),
      dataIndex: 'id',
      key: '_id',
      render: (id) => {
        return <>
          <Row>
            <Col>
              <Text strong>{id}</Text>
            </Col>
          </Row>
        </>
      },
    },
    {
      title: t("wallet_masternodes_address"),
      dataIndex: 'addr',
      key: 'addr',
      render: (addr) => {
        return <>
          <Row>
            <Col span={24}>
              <Text strong>
                <AddressComponent address={addr} qrcode copyable />
              </Text>
            </Col>
          </Row>
        </>
      },
    },
    {
      title: t("wallet_masternodes_stake"),
      dataIndex: 'id',
      key: '_id2',
      width: "300px",
      render: (id, masternodeInfo: MasternodeInfo) => {
        const amount = masternodeInfo.founders.reduce<CurrencyAmount>(
          (amount, memberInfo) => amount.add(memberInfo.amount),
          CurrencyAmount.ether(JSBI.BigInt(0))
        )
        const masternodeTarget = CurrencyAmount.ether(ethers.utils.parseEther(Safe4_Business_Config.Masternode.Create.LockAmount + "").toBigInt());
        const couldAddPartner = masternodeTarget.greaterThan(amount) && (addrNodeInfo && !addrNodeInfo.isNode);
        return <>
          <Row>
            <Col span={12}>
              {amount.toFixed(2)} SAFE
            </Col>
            <Col span={12}>
              <Space direction='horizontal' style={{ float: "right" }}>
                <Button size='small' style={{ float: "right" }}
                  type={couldAddPartner ? "primary" : "default"}
                  onClick={() => {
                    if (couldAddPartner) {
                      dispatch(applicationControlAppendMasternode(masternodeInfo.addr))
                      navigate("/main/masternodes/append")
                    } else {
                      setOpenMasternodeInfo(masternodeInfo);
                      setOpenMasternodeModal(true);
                    }
                  }}>
                  {couldAddPartner ? t("join") : t("view")}
                </Button>
                {
                  queryMyMasternodes &&
                  <Button type={masternodeInfo.state != 1 ? "primary" : "default"} size='small' style={{ float: "right" }}
                    onClick={() => {
                      dispatch(applicationControlUpdateEditMasternodeId(masternodeInfo.id));
                      navigate("/main/masternodes/selectSyncMode")
                    }}>
                    {t("sync")}
                  </Button>
                }
              </Space>
            </Col>
          </Row>
        </>
      },
    },
  ];

  const doSearch = useCallback(async () => {
    if (masternodeStorageContract && queryKey) {
      if (queryKey.indexOf("0x") == 0) {
        // do query as Address ;
        if (ethers.utils.isAddress(queryKey)) {
          const addr = queryKey;
          setLoading(true);
          const exist = await masternodeStorageContract.callStatic.exist(addr);
          if (exist) {
            const _masternodeInfo = await masternodeStorageContract.callStatic.getInfo(addr);
            loadMasternodeInfos([_masternodeInfo.addr]);
            setPagination(undefined);
          } else {
            setMasternodes([]);
            setPagination(undefined);
            setQueryKeyError( t("wallet_masternodes_address") + t("notExist") );
            setLoading(false);
          }
        } else {
          setQueryKeyError( t("enter_correct") + t("wallet_masternodes_address") );
        }
      } else {
        const id = Number(queryKey);
        if (id) {
          setLoading(true);
          const exist = await masternodeStorageContract.callStatic.existID(id);
          if (exist) {
            const _masternodeInfo = await masternodeStorageContract.callStatic.getInfoByID(id);
            loadMasternodeInfos([_masternodeInfo.addr]);
            setPagination(undefined);
          } else {
            setMasternodes([]);
            setPagination(undefined);
            setQueryKeyError( t("wallet_masternodes_id") + t("notExist") );
            setLoading(false);
          }
        } else {
          setQueryKeyError(t("wallet_masternodes_query_invalid"));
        }
      }
    }
  }, [masternodeStorageContract, queryKey]);

  return <>
    {
      <Row style={{ marginBottom: "20px" }}>
        <Col span={12}>
          <Input.Search size='large' placeholder={`${t("wallet_masternodes_id")} | ${t("wallet_masternodes_address")}`} onChange={(event) => {
            setQueryKeyError(undefined);
            if (!event.target.value) {
              setQueryKey(undefined);
            }
          }} onSearch={setQueryKey} />
          {
            queryKeyError &&
            <Alert type='error' showIcon message={queryKeyError} style={{ marginTop: "5px" }} />
          }
        </Col>
      </Row>
    }

    {
      queryMyMasternodes && <Row style={{ marginBottom: "20px" }}>
        <Col span={24}>
          <Alert type='info' message={<>
            <Text>{t("wallet_masternodes_mytip0")}</Text><br />
            <Text>{t("wallet_masternodes_mytip1")} <Text strong>{t("sync")}</Text>,{t("wallet_masternodes_mytip2")}</Text>
          </>} />
        </Col>
      </Row>
    }

    <Table loading={loading} onChange={(pagination) => {
      const { current, pageSize, total } = pagination;
      setPagination({
        current, pageSize, total
      })
    }} dataSource={masternodes} columns={columns} size="large" pagination={pagination} />

    <Modal destroyOnClose open={openMasternodeModal} width={1000} footer={null} closable onCancel={() => {
      setOpenMasternodeInfo(undefined);
      setOpenMasternodeModal(false);
    }}>
      {
        openMasternodeInfo && <Masternode masternodeInfo={openMasternodeInfo} />
      }
    </Modal>

  </>
}
