const axios = require('axios');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const readLines = require('n-readlines');
const { json } = require('stream/consumers');

// Global variables
const BASE_URL = "https://cas.myground11.co.in";
let currentDate = "";
let nextDate;
let outputDirectoryPath = process.cwd();
const warningStr = 'Usage: node index.js <DATE (YYYY-MM-DD)> <collect/payout>';

// Directories / file names
const eodDir = "EOD";
let bankStmtFileName;
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJlODdjZTAzMS0yZDZmLTQ0ZjAtYmY0Zi00ODg2Yjc2ZmIzMzIiLCJuYW1lIjpbImdldF9heGlzX2JhbmtfYWNjb3VudF9zdGF0ZW1lbnQiLCJnZXRfcGF5b3V0X2xvZ19lbnRyaWVzX2RhdGVfcmFuZ2UiLCJnZXRfdmFuX2NvbGxlY3RzX2VudHJpZXNfZGF0ZV9yYW5nZSIsImNoZWNrX2FuZF9wcm9jZXNzX3N0YXR1c193aXRoX2F4aXNfYmFuayIsImdldF9wYXlvdXRfbG9nX2VudHJpZXMiLCJjaGVja19zdGF0dXNfd2l0aF9heGlzX2JhbmsiLCJyZXZlcnRfcGF5b3V0c193aXRoX3V0ciJdLCJhdXRob3JpemVkX3BlcnNvbiI6eyJuYW1lIjoiQW51c3JlZSBWaW5vZCJ9LCJ0eXBlIjoic2VydmljZSIsImVudiI6ImxpdmUiLCJpYXQiOjE3MjY1NDgwMDd9.A6GWK1uflE2Qxx28vip5QsahM4nCsXLaueA_wL2Hc8s";

let serialCounter = 1;
let bnkStmtWriterInterface;
let bnkStmtReaderInterface;
let numberOfStmtFetchCount = 1;
const stmtMap = {};
let stmtType;

// Process args
if (process.argv.length < 4 || process.argv.length > 4) {
    console.log(warningStr);
    process.exit(1);
} else {
    currentDate = process.argv[2];

    if (process.argv[3] === 'collect' || process.argv[3] === 'payout') {
        stmtType = process.argv[3];
        stmtType === 'collect' ? bankStmtFileName = "collect_bank_statements.json" : bankStmtFileName = "bank_statements.json";
    } else {
        console.log(warningStr);
        process.exit(1);
    }
    outputDirectoryPath += `/${eodDir}/${currentDate.split("-").join("/")}/in/`;

    let date_check_moment = moment(currentDate, 'YYYY-MM-DD', true);
    if (!date_check_moment.isValid()) {
        console.log("Invalid Date", warningStr);
        process.exit(-1);
    }

    if (process.argv.length > 4 && isStringPositiveInteger(process.argv[4])) {
        scan_increment_in_min = parseInt(process.argv[3], 10);
    }
}

const filePath = path.join(__dirname, 'paginationData.json');

// Function to read all key-value pairs
function readAllKeyValues() {
  if (!fs.existsSync(filePath)) return {};
  const rawData = fs.readFileSync(filePath, 'utf8');
  return rawData.trim() ? JSON.parse(rawData) : {};
}

// Function to update or add a key-value pair
function updateKeyValue(key, value) {
  const data = readAllKeyValues();
  data[key] = value;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// Function to fetch value by key
function getValueByKey(key) {
  const data = readAllKeyValues();
  return data[key];
}


// Function to ensure directory exists and create/truncate file
const setupOutputFile = () => {
    const dirPath = path.dirname(outputDirectoryPath + bankStmtFileName);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }

    // fs.writeFileSync(outputDirectoryPath + bankStmtFileName, '');
    bnkStmtWriterInterface = fs.createWriteStream(outputDirectoryPath + bankStmtFileName, { flags: 'a' });
};

const createPreStatementMap = async () => {
    // processing function.
    const processStmtLine = (line) => {
        if (!line) return;
        const parsedStmt = JSON.parse(line);
        const utr = parsedStmt.utrNumber;
        const bal = parsedStmt.balance;
        const uqStr = parsedStmt.pstdDate;
        const key = `${utr}_${bal}_${uqStr}`;
        if (!key) return;
        if (key in stmtMap) {
            console.log("duplicate found: ", key);
        } else {
            stmtMap[key] = true;
            console.log("updated Stmt map: ", key);
        }
    };

    try {
        if (fs.existsSync(outputDirectoryPath + bankStmtFileName) && fs.statSync(outputDirectoryPath + bankStmtFileName).size !== 0) {
            bnkStmtReaderInterface = new readLines(outputDirectoryPath + bankStmtFileName);
        } else {
            fs.mkdirSync(outputDirectoryPath, { recursive: true });
        }
    } catch (e) {
        console.log('Error:', e.stack);
        return false;
    }

    if (bnkStmtReaderInterface) {
        let line;
        while ((line = bnkStmtReaderInterface.next())) {
            processStmtLine(line);
        }
    }
};

// Statement API Call
const getStmtApiCall = async (url, data) => {
    const options = { headers: { 'Content-Type': 'application/json', 'apikey': serviceKey } };
    try {
        console.log(data);
        const response = await axios.post(url, data, options);
        if (response.status === 200) {
            return Promise.resolve({ success: true, data: response.data });
        } else {
            return Promise.reject({ success: false, message: "No data from server." });
        }
    } catch (error) {
        console.error(error);
        return Promise.reject({ success: false, message: error.message });
    }
};

const getStatements = async (fromDate, toDate, amtValue, curCode, LpstDate, LTxnDate, LtxnID, LsrlNo) => {
    updateKeyValue("Amount_Value",amtValue);
    updateKeyValue("Currency_Code",curCode);
    updateKeyValue("Last_Pstd_Date", LpstDate);
    updateKeyValue("Last_Txn_Date",LTxnDate);
    updateKeyValue("Last_Txn_Id",LtxnID);
    updateKeyValue("Last_Txn_SrlNo",LsrlNo);

    const url = `${BASE_URL}/v1/service/get_rbl_bank_account_statement`;
    let ledger;
    if (stmtType === 'collect') {
        ledger = "MYground11Collect409002366181";
    }
    if (stmtType === 'payout') {
        ledger = "MYGROUND11409002362954";
    }

    const requestPayload = {
        ledger_label: ledger,
        from_date: fromDate,
        to_date: toDate,
        format: "json",
        pagination_details: {
            Last_Balance: {
                Amount_Value: amtValue,
                Currency_Code: curCode
            },
            Last_Pstd_Date: LpstDate,
            Last_Txn_Date: LTxnDate,
            Last_Txn_Id: LtxnID,
            Last_Txn_SrlNo: LsrlNo
        }
    };

    console.log("--------------------------------------------------------------------------------------");
    console.log("\nURL---> ", url);
    console.log(`Fetching the Statement for ${numberOfStmtFetchCount} time`);
    const response = await getStmtApiCall(url, requestPayload);
    console.log("--------------------------------------------------------------------------------------");

    const responseData = response.data;

    if (Array.isArray(responseData)) {
        const statementArray = responseData;

        let txnDesc, allTxnID, runBlc, currencyCode, pstdDate, txnDate, txnID, txnSrlNo, txnsAmt, drcr, valueDate;

        for (let stmts = 0; stmts < statementArray.length; stmts++) {
            const jsonStmts = statementArray[stmts];

            //Outer body statment paramenters
            pstdDate = jsonStmts.pstdDate ? jsonStmts.pstdDate.trim() : "";

            //TransactionSummary body
            txnsAmt = jsonStmts.transactionSummary.txnAmt.amountValue ? parseFloat(jsonStmts.transactionSummary.txnAmt.amountValue) : 0;
            txnDate = jsonStmts.transactionSummary.txnDate ? jsonStmts.transactionSummary.txnDate.trim() : "";
            txnDesc = jsonStmts.transactionSummary.txnDesc ? jsonStmts.transactionSummary.txnDesc.trim() : "";
            if (jsonStmts.transactionSummary.txnType === "D") {
                txnType = "DR";
            } else if (jsonStmts.transactionSummary.txnType === "C") {
                txnType = "CR";
            } else {
                txnType = "";
            }

            //TxnBalance body
            runBlc = jsonStmts.txnBalance.amountValue ? parseFloat(jsonStmts.txnBalance.amountValue.trim()) : 0;
            currencyCode = jsonStmts.txnBalance.currencyCode ? jsonStmts.txnBalance.currencyCode.trim() : "";

            //OuterBody
            allTxnID = jsonStmts.txnId.trim();
            txnID = jsonStmts.txnId ? jsonStmts.txnId.trim() : "";
            txnSrlNo = jsonStmts.txnSrlNo.trim();
            valueDate = jsonStmts.valueDate ? jsonStmts.valueDate.trim() : "";


            //Formating the time statmps
            const FormatedTxnDate = moment(txnDate, "YYYY-MM-DDTHH:mm:ss.SSS").format("DD/MM/YYYY");
            const FormatedPstdDate = moment(pstdDate, "YYYY-MM-DDTHH:mm:ss.SSS").format("DD/MM/YYYY HH:mm:ss");
            const formatedValueDate = moment(valueDate, "YYYY-MM-DDTHH:mm:ss.SSS").format("DD/MM/YYYY");
            const timeStamp = moment(pstdDate, "YYYY-MM-DDTHH:mm:ss.SSS").format("HH:mm:ss");

            const transaction = {
                serialNumber: serialCounter,
                transactionDate: FormatedTxnDate,
                pstdDate: FormatedPstdDate,
                transactionParticulars: txnDesc,
                chqNumber: "",
                valueDate: formatedValueDate,
                amount: txnsAmt,
                drcr: txnType,
                balance: runBlc,
                paymentMode: "", //added
                utrNumber: "",  //added
                internalReferenceNumber: txnID,
                remittingBranch: "",
                remittingBankName: "",
                remittingAccountNumber: "",
                remittingAccountName: "",
                remittingIFSC: "",
                benficiaryBranch: "",
                benficiaryName: "",
                benficiaryAccountNumber: "",
                benficiaryIFSC: "",
                channel: "", //added
                timeStamp: timeStamp,
                remarks: "",
                transactionCurrencyCode: currencyCode,
                internalReferenceId: "",
                transactionParticular2: "",
                customerReferenceNumber: "",
                virtualAccountNumber: "", //added
                corporateCode: "",
                additionalField1: "",
                additionalField2: "",
                additionalField3: ""
            };

            let utr_rrn, upi_id, mode;

            // UPI transaction handling
            // Extract UTR number based on transaction type
            if (txnDesc.startsWith("UPI/")) {
                transaction.utrNumber = txnDesc === "" ? "" : txnDesc.split("/")[1].trim();
                transaction.paymentMode = "UPI";
                transaction.channel = "UPI";
                if (txnDesc.split("/").length < 4) {
                    transaction.virtualAccountNumber = "";
                } else {
                    transaction.virtualAccountNumber = txnDesc ? txnDesc.split("/")[3].trim() : "";
                }
            }
            else if (txnDesc.startsWith("R/UPI/")) {
                transaction.utrNumber = txnDesc === "" ? "" : txnDesc.split("/")[2].trim();
                transaction.paymentMode = "UPI";
                transaction.channel = "UPI";
                if (txnDesc.split("/").length < 5) {
                    transaction.virtualAccountNumber = "";
                } else {
                    transaction.virtualAccountNumber = txnDesc ? txnDesc.split("/")[4].trim() : "";
                }
            }
            else if (txnDesc.includes("-")) {
                if (txnDesc.startsWith("R-")) {
                    transaction.utrNumber = txnDesc === "" ? "" : txnDesc.split("-")[1].trim();
                } else {
                    transaction.utrNumber = txnDesc === "" ? "" : txnDesc.split("-")[0].trim();
                }
                transaction.paymentMode = "IMPS";
                transaction.channel = "IMPS";
            }
            else if (txnDesc.startsWith("NEFT/")) {
                transaction.utrNumber = txnDesc === "" ? "" : txnDesc.split("/")[1].trim();
                transaction.paymentMode = "NEFT";
                transaction.channel = "NEFT";
            }
            // RTGS transaction
            else if (txnDesc.startsWith("RTGS/")) {
                transaction.utrNumber = txnDesc === "" ? "" : txnDesc.split("/")[1].trim();  // Extract number after "RTGS/"
                transaction.paymentMode = "RTGS";
                transaction.channel = "RTGS";
            }
            // Internal Collect
            else if (txnDesc.startsWith("IB")) {
                transaction.utrNumber = txnDesc === "" ? "" : txnDesc.split("/")[0].trim();  // Extract first array"
                transaction.paymentMode = "OFT";
                transaction.channel = "OFT";
            }
            // IFT or other transactions fall back to txnId
            else {
                transaction.utrNumber = txnDesc === "" ? "" : txnDesc.trim();
                transaction.paymentMode = "IFT";
                transaction.channel = "IFT";
            }

            /**
             * Validating the postDate with statment fetch Date if both are matching pushing to stmtArray
             */
            const stmtTxnDate = moment(pstdDate, "YYYY-MM-DDTHH:mm:ss.SSS").format("YYYY-MM-DD");
            let stmtFetchDate = moment(currentDate, 'YYYY-MM-DD').format('YYYY-MM-DD');

            const key = `${transaction.utrNumber}_${runBlc}_${FormatedPstdDate}`;
            if (stmtTxnDate === stmtFetchDate) {
                // Increment serial number for each transaction
                serialCounter++;

                if (!key) return;
                if (key in stmtMap) {
                    console.log("duplicate found: ", key);
                } else {
                    stmtMap[key] = true;
                    fs.appendFileSync(outputDirectoryPath + bankStmtFileName, `${JSON.stringify(transaction)}\n`, 'utf8');
                }
            }

            //If postDate is next days date the I will return without fetch for further
            if (stmtTxnDate === nextDate) {
                return;
            }
        }

        // Recursive call for pagination
        numberOfStmtFetchCount++;
        await getStatements(fromDate, toDate, runBlc, currencyCode, pstdDate, txnDate, txnID, txnSrlNo);
    } else {
        if (responseData.error_msg === "No record could be retrieved") {
            console.log("Statement Fetch is done");
        } else {
            console.log("Request body -->", requestPayload)
            console.error("ERROR: Check Once", responseData);
        }
    }
};

const startProcess = async () => {
    setupOutputFile();

    await createPreStatementMap();

    const paginationData = readAllKeyValues();
    let prevDate = moment(currentDate, 'YYYY-MM-DD').subtract(1, 'days').format('YYYY-MM-DD');
    let currentBrsDate = moment(currentDate, 'YYYY-MM-DD').format('YYYY-MM-DD');
    nextDate = moment(currentDate, 'YYYY-MM-DD').add(1, 'days').format('YYYY-MM-DD');

    await getStatements(
        prevDate, // fromDate
        currentBrsDate, // toDate
        paginationData.Amount_Value?paginationData.Amount_Value:"",       // amtValue
        paginationData.Currency_Code?paginationData.Currency_Code:"",       // curCode
        paginationData.Last_Pstd_Date?paginationData.Last_Pstd_Date:"",       // LpstDate
        paginationData.Last_Txn_Date?paginationData.Last_Txn_Date:"",       // LTxnDate
        paginationData.Last_Txn_Id?paginationData.Last_Txn_Id:"",       // LtxnID
        paginationData.Last_Txn_SrlNo?paginationData.Last_Txn_SrlNo:""        // LsrlNo
    );

};

startProcess();