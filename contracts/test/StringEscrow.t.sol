// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {StringEscrow} from "../src/StringEscrow.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract StringEscrowTest is Test {
    StringEscrow public escrow;
    MockUSDC public usdc;

    uint256 internal buyerPk = 0xBEEF;
    address internal buyer;
    uint256 internal providerPk = 0xCAFE;
    address internal provider;
    address internal judge;
    address internal feeRecipient = address(0xFEE1);

    uint256 constant AMOUNT = 100_000_000; // 100 USDC
    bytes32 constant DESC_HASH = keccak256("build a trading bot");

    // EIP-712 type hashes
    bytes32 constant CREATE_JOB_TYPEHASH = keccak256("CreateJob(address buyer,address provider,uint256 amount,bytes32 descriptionHash,bytes32 nonce)");
    bytes32 constant MARK_DONE_TYPEHASH = keccak256("MarkDone(uint256 jobId)");
    bytes32 constant ACCEPT_RESULT_TYPEHASH = keccak256("AcceptResult(uint256 jobId)");
    bytes32 constant DISPUTE_TYPEHASH = keccak256("Dispute(uint256 jobId)");
    bytes32 constant TRANSFER_AUTH_TYPEHASH = keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    function setUp() public {
        buyer = vm.addr(buyerPk);
        provider = vm.addr(providerPk);
        judge = address(this); // test contract is the owner/judge

        usdc = new MockUSDC();
        escrow = new StringEscrow(address(usdc), feeRecipient, judge);

        // Fund buyer
        usdc.mint(buyer, 1_000_000_000); // 1000 USDC
    }

    // ── Helpers ──

    function _escrowDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("StringEscrow"),
            keccak256("1"),
            block.chainid,
            address(escrow)
        ));
    }

    function _usdcDomainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("MockUSDC"),
            keccak256("1"),
            block.chainid,
            address(usdc)
        ));
    }

    function _signCreateJob(uint256 pk, address b, address p, uint256 amt, bytes32 descHash, bytes32 nonce)
        internal view returns (bytes memory)
    {
        bytes32 structHash = keccak256(abi.encode(CREATE_JOB_TYPEHASH, b, p, amt, descHash, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _escrowDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signTransferAuth(uint256 pk, address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce)
        internal view returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 structHash = keccak256(abi.encode(TRANSFER_AUTH_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _usdcDomainSeparator(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    function _signJobAction(uint256 pk, bytes32 typeHash, uint256 jobId) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(typeHash, jobId));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _escrowDomainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _signMarkDone(uint256 pk, uint256 jobId) internal view returns (bytes memory) {
        return _signJobAction(pk, MARK_DONE_TYPEHASH, jobId);
    }

    function _signAcceptResult(uint256 pk, uint256 jobId) internal view returns (bytes memory) {
        return _signJobAction(pk, ACCEPT_RESULT_TYPEHASH, jobId);
    }

    function _signDispute(uint256 pk, uint256 jobId) internal view returns (bytes memory) {
        return _signJobAction(pk, DISPUTE_TYPEHASH, jobId);
    }

    function _createAndFundJob() internal returns (uint256 jobId) {
        return _createAndFundJob(bytes32(uint256(1)));
    }

    function _createAndFundJob(bytes32 jobNonce) internal returns (uint256 jobId) {
        bytes memory buyerSig = _signCreateJob(buyerPk, buyer, provider, AMOUNT, DESC_HASH, jobNonce);
        bytes32 payNonce = keccak256(abi.encode("pay", jobNonce));
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(buyerPk, buyer, address(escrow), AMOUNT, 0, type(uint256).max, payNonce);

        jobId = escrow.createAndFund(buyer, provider, AMOUNT, DESC_HASH, jobNonce, buyerSig, 0, type(uint256).max, payNonce, v, r, s);
    }

    function _createAndMarkDone() internal returns (uint256 jobId) {
        jobId = _createAndFundJob();
        bytes memory sig = _signMarkDone(providerPk, jobId);
        escrow.markDone(jobId, sig);
    }

    // ── Constructor tests ──

    function test_constructor_setsImmutables() public view {
        assertEq(address(escrow.usdc()), address(usdc));
        assertEq(escrow.feeRecipient(), feeRecipient);
        assertEq(escrow.owner(), judge);
    }

    function test_constructor_revert_zeroUsdc() public {
        vm.expectRevert(StringEscrow.ZeroAddress.selector);
        new StringEscrow(address(0), feeRecipient, judge);
    }

    function test_constructor_revert_zeroFeeRecipient() public {
        vm.expectRevert(StringEscrow.ZeroAddress.selector);
        new StringEscrow(address(usdc), address(0), judge);
    }

    // ── createAndFund tests ──

    function test_createAndFund_success() public {
        uint256 jobId = _createAndFundJob();
        assertEq(jobId, 0);
        assertEq(escrow.jobCount(), 1);
    }

    function test_createAndFund_storesJobCorrectly() public {
        uint256 jobId = _createAndFundJob();
        StringEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(job.buyer, buyer);
        assertEq(job.provider, provider);
        assertEq(job.amount, AMOUNT);
        assertEq(job.descriptionHash, DESC_HASH);
        assertEq(uint8(job.status), uint8(StringEscrow.JobStatus.Funded));
        assertEq(job.createdAt, block.timestamp);
        assertEq(job.doneAt, 0);
    }

    function test_createAndFund_transfersFunds() public {
        uint256 buyerBefore = usdc.balanceOf(buyer);
        _createAndFundJob();
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT);
        assertEq(usdc.balanceOf(buyer), buyerBefore - AMOUNT);
    }

    function test_createAndFund_emitsEvent() public {
        bytes32 jobNonce = bytes32(uint256(1));
        bytes memory buyerSig = _signCreateJob(buyerPk, buyer, provider, AMOUNT, DESC_HASH, jobNonce);
        bytes32 payNonce = keccak256(abi.encode("pay", jobNonce));
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(buyerPk, buyer, address(escrow), AMOUNT, 0, type(uint256).max, payNonce);

        vm.expectEmit(true, true, true, true);
        emit StringEscrow.JobCreated(0, buyer, provider, AMOUNT, DESC_HASH);
        escrow.createAndFund(buyer, provider, AMOUNT, DESC_HASH, jobNonce, buyerSig, 0, type(uint256).max, payNonce, v, r, s);
    }

    function test_createAndFund_revert_invalidSignature() public {
        bytes memory wrongSig = _signCreateJob(providerPk, buyer, provider, AMOUNT, DESC_HASH, bytes32(uint256(1)));
        bytes32 payNonce = keccak256("pay1");
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(buyerPk, buyer, address(escrow), AMOUNT, 0, type(uint256).max, payNonce);

        vm.expectRevert(StringEscrow.InvalidSignature.selector);
        escrow.createAndFund(buyer, provider, AMOUNT, DESC_HASH, bytes32(uint256(1)), wrongSig, 0, type(uint256).max, payNonce, v, r, s);
    }

    function test_createAndFund_revert_nonceReplay() public {
        bytes32 jobNonce = bytes32(uint256(1));
        _createAndFundJob(jobNonce);

        bytes memory buyerSig = _signCreateJob(buyerPk, buyer, provider, AMOUNT, DESC_HASH, jobNonce);
        bytes32 payNonce = keccak256("pay-replay");
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(buyerPk, buyer, address(escrow), AMOUNT, 0, type(uint256).max, payNonce);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.NonceAlreadyUsed.selector, jobNonce));
        escrow.createAndFund(buyer, provider, AMOUNT, DESC_HASH, jobNonce, buyerSig, 0, type(uint256).max, payNonce, v, r, s);
    }

    function test_createAndFund_revert_zeroAmount() public {
        bytes memory buyerSig = _signCreateJob(buyerPk, buyer, provider, 0, DESC_HASH, bytes32(uint256(1)));
        bytes32 payNonce = keccak256("pay1");
        (uint8 v, bytes32 r, bytes32 s) = _signTransferAuth(buyerPk, buyer, address(escrow), 0, 0, type(uint256).max, payNonce);

        vm.expectRevert(StringEscrow.ZeroAmount.selector);
        escrow.createAndFund(buyer, provider, 0, DESC_HASH, bytes32(uint256(1)), buyerSig, 0, type(uint256).max, payNonce, v, r, s);
    }

    function test_createAndFund_revert_zeroBuyer() public {
        vm.expectRevert(StringEscrow.ZeroAddress.selector);
        escrow.createAndFund(address(0), provider, AMOUNT, DESC_HASH, bytes32(uint256(1)), "", 0, type(uint256).max, bytes32(0), 0, bytes32(0), bytes32(0));
    }

    function test_createAndFund_revert_zeroProvider() public {
        vm.expectRevert(StringEscrow.ZeroAddress.selector);
        escrow.createAndFund(buyer, address(0), AMOUNT, DESC_HASH, bytes32(uint256(1)), "", 0, type(uint256).max, bytes32(0), 0, bytes32(0), bytes32(0));
    }

    // ── markDone tests ──

    function test_markDone_success() public {
        uint256 jobId = _createAndFundJob();
        bytes memory sig = _signMarkDone(providerPk, jobId);
        escrow.markDone(jobId, sig);

        StringEscrow.Job memory job = escrow.getJob(jobId);
        assertEq(uint8(job.status), uint8(StringEscrow.JobStatus.Done));
        assertEq(job.doneAt, block.timestamp);
    }

    function test_markDone_emitsEvent() public {
        uint256 jobId = _createAndFundJob();
        bytes memory sig = _signMarkDone(providerPk, jobId);

        vm.expectEmit(true, false, false, true);
        emit StringEscrow.JobMarkedDone(jobId, block.timestamp);
        escrow.markDone(jobId, sig);
    }

    function test_markDone_revert_notFunded() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory sig = _signMarkDone(providerPk, jobId);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.InvalidStatus.selector, jobId, StringEscrow.JobStatus.Funded, StringEscrow.JobStatus.Done));
        escrow.markDone(jobId, sig);
    }

    function test_markDone_revert_invalidSignature() public {
        uint256 jobId = _createAndFundJob();
        bytes memory wrongSig = _signMarkDone(buyerPk, jobId); // buyer, not provider

        vm.expectRevert(StringEscrow.InvalidSignature.selector);
        escrow.markDone(jobId, wrongSig);
    }

    function test_markDone_revert_jobNotFound() public {
        bytes memory sig = _signMarkDone(providerPk, 999);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.JobNotFound.selector, 999));
        escrow.markDone(999, sig);
    }

    // ── acceptResult tests ──

    function test_acceptResult_success() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory sig = _signAcceptResult(buyerPk, jobId);

        uint256 fee = (AMOUNT * 500) / 10_000; // 5%
        uint256 payout = AMOUNT - fee;

        escrow.acceptResult(jobId, sig);

        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Settled));
        assertEq(usdc.balanceOf(provider), payout);
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    function test_acceptResult_correctFeeDeduction() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory sig = _signAcceptResult(buyerPk, jobId);
        escrow.acceptResult(jobId, sig);

        uint256 expectedFee = (AMOUNT * 500) / 10_000;
        assertEq(usdc.balanceOf(feeRecipient), expectedFee);
        assertEq(usdc.balanceOf(provider), AMOUNT - expectedFee);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_acceptResult_emitsEvents() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory sig = _signAcceptResult(buyerPk, jobId);

        uint256 fee = (AMOUNT * 500) / 10_000;
        uint256 payout = AMOUNT - fee;

        vm.expectEmit(true, false, false, false);
        emit StringEscrow.JobAccepted(jobId);
        vm.expectEmit(true, true, false, true);
        emit StringEscrow.JobSettled(jobId, provider, payout, fee);
        escrow.acceptResult(jobId, sig);
    }

    function test_acceptResult_revert_notDone() public {
        uint256 jobId = _createAndFundJob();
        bytes memory sig = _signAcceptResult(buyerPk, jobId);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.InvalidStatus.selector, jobId, StringEscrow.JobStatus.Done, StringEscrow.JobStatus.Funded));
        escrow.acceptResult(jobId, sig);
    }

    function test_acceptResult_revert_invalidSignature() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory wrongSig = _signAcceptResult(providerPk, jobId);

        vm.expectRevert(StringEscrow.InvalidSignature.selector);
        escrow.acceptResult(jobId, wrongSig);
    }

    // ── claimTimeout tests ──

    function test_claimTimeout_success() public {
        uint256 jobId = _createAndMarkDone();
        vm.warp(block.timestamp + 24 hours + 1);

        escrow.claimTimeout(jobId);

        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Settled));
        uint256 fee = (AMOUNT * 500) / 10_000;
        assertEq(usdc.balanceOf(provider), AMOUNT - fee);
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    function test_claimTimeout_revert_periodNotExpired() public {
        uint256 jobId = _createAndMarkDone();
        vm.warp(block.timestamp + 12 hours); // only half

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.AcceptancePeriodNotExpired.selector, jobId));
        escrow.claimTimeout(jobId);
    }

    function test_claimTimeout_revert_notDone() public {
        uint256 jobId = _createAndFundJob();
        vm.warp(block.timestamp + 24 hours + 1);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.InvalidStatus.selector, jobId, StringEscrow.JobStatus.Done, StringEscrow.JobStatus.Funded));
        escrow.claimTimeout(jobId);
    }

    function test_claimTimeout_revert_disputed() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory disputeSig = _signDispute(buyerPk, jobId);
        escrow.dispute(jobId, disputeSig);
        vm.warp(block.timestamp + 24 hours + 1);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.InvalidStatus.selector, jobId, StringEscrow.JobStatus.Done, StringEscrow.JobStatus.Disputed));
        escrow.claimTimeout(jobId);
    }

    // ── dispute tests ──

    function test_dispute_success() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory sig = _signDispute(buyerPk, jobId);
        escrow.dispute(jobId, sig);

        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Disputed));
    }

    function test_dispute_emitsEvent() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory sig = _signDispute(buyerPk, jobId);

        vm.expectEmit(true, false, false, false);
        emit StringEscrow.JobDisputed(jobId);
        escrow.dispute(jobId, sig);
    }

    function test_dispute_revert_notDone() public {
        uint256 jobId = _createAndFundJob();
        bytes memory sig = _signDispute(buyerPk, jobId);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.InvalidStatus.selector, jobId, StringEscrow.JobStatus.Done, StringEscrow.JobStatus.Funded));
        escrow.dispute(jobId, sig);
    }

    function test_dispute_revert_invalidSignature() public {
        uint256 jobId = _createAndMarkDone();
        bytes memory wrongSig = _signDispute(providerPk, jobId);

        vm.expectRevert(StringEscrow.InvalidSignature.selector);
        escrow.dispute(jobId, wrongSig);
    }

    // ── resolveDispute tests ──

    function test_resolveDispute_fullToBuyer() public {
        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));

        escrow.resolveDispute(jobId, AMOUNT, 0);

        uint256 fee = (AMOUNT * 500) / 10_000;
        assertEq(usdc.balanceOf(buyer) + AMOUNT, 1_000_000_000 + (AMOUNT - fee)); // buyer got back (amount - fee) net
        assertEq(usdc.balanceOf(provider), 0);
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    function test_resolveDispute_fullToProvider() public {
        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));

        escrow.resolveDispute(jobId, 0, AMOUNT);

        uint256 fee = (AMOUNT * 500) / 10_000;
        assertEq(usdc.balanceOf(provider), AMOUNT - fee);
        assertEq(usdc.balanceOf(feeRecipient), fee);
    }

    function test_resolveDispute_split5050() public {
        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));

        uint256 half = AMOUNT / 2;
        escrow.resolveDispute(jobId, half, half);

        uint256 fee = (AMOUNT * 500) / 10_000;
        uint256 totalAfterFee = AMOUNT - fee;
        uint256 buyerPayout = (totalAfterFee * half) / AMOUNT;
        uint256 providerPayout = totalAfterFee - buyerPayout;

        assertEq(usdc.balanceOf(feeRecipient), fee);
        // Buyer had (1000 - 100) = 900 USDC before, now gets buyerPayout back
        assertEq(usdc.balanceOf(buyer), 1_000_000_000 - AMOUNT + buyerPayout);
        assertEq(usdc.balanceOf(provider), providerPayout);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_resolveDispute_emitsEvent() public {
        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));

        uint256 fee = (AMOUNT * 500) / 10_000;
        uint256 half = AMOUNT / 2;

        vm.expectEmit(true, false, false, true);
        emit StringEscrow.DisputeResolved(jobId, half, half, fee);
        escrow.resolveDispute(jobId, half, half);
    }

    function test_resolveDispute_revert_notDisputed() public {
        uint256 jobId = _createAndMarkDone();

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.InvalidStatus.selector, jobId, StringEscrow.JobStatus.Disputed, StringEscrow.JobStatus.Done));
        escrow.resolveDispute(jobId, AMOUNT / 2, AMOUNT / 2);
    }

    function test_resolveDispute_revert_notOwner() public {
        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));

        vm.prank(buyer);
        vm.expectRevert();
        escrow.resolveDispute(jobId, AMOUNT / 2, AMOUNT / 2);
    }

    function test_resolveDispute_revert_invalidSplitAmounts() public {
        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.InvalidSplitAmounts.selector, AMOUNT + 1, AMOUNT));
        escrow.resolveDispute(jobId, AMOUNT, 1);
    }

    // ── forceClose tests ──

    function test_forceClose_afterMaxLifetime() public {
        uint256 jobId = _createAndFundJob();
        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.warp(block.timestamp + 7 days + 1);

        escrow.forceClose(jobId);

        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Settled));
        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT); // full refund
        assertEq(usdc.balanceOf(feeRecipient), 0); // no fee
    }

    function test_forceClose_revert_beforeMaxLifetime() public {
        uint256 jobId = _createAndFundJob();
        vm.warp(block.timestamp + 3 days);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.MaxLifetimeNotExpired.selector, jobId));
        escrow.forceClose(jobId);
    }

    function test_forceClose_revert_alreadySettled() public {
        uint256 jobId = _createAndMarkDone();
        escrow.acceptResult(jobId, _signAcceptResult(buyerPk, jobId));
        vm.warp(block.timestamp + 7 days + 1);

        vm.expectRevert(abi.encodeWithSelector(StringEscrow.AlreadySettled.selector, jobId));
        escrow.forceClose(jobId);
    }

    function test_forceClose_fromDone() public {
        uint256 jobId = _createAndMarkDone();
        vm.warp(block.timestamp + 7 days + 1);

        escrow.forceClose(jobId);
        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Settled));
    }

    function test_forceClose_fromDisputed() public {
        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));
        vm.warp(block.timestamp + 7 days + 1);

        escrow.forceClose(jobId);
        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Settled));
    }

    // ── Fuzz tests ──

    function testFuzz_feeCalculation(uint256 amount) public pure {
        vm.assume(amount > 0 && amount < type(uint128).max);
        uint256 fee = (amount * 500) / 10_000;
        uint256 payout = amount - fee;
        assertEq(fee + payout, amount);
    }

    function testFuzz_disputeSplit(uint256 buyerAmount) public {
        vm.assume(buyerAmount <= AMOUNT);
        uint256 providerAmount = AMOUNT - buyerAmount;

        uint256 jobId = _createAndMarkDone();
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));
        escrow.resolveDispute(jobId, buyerAmount, providerAmount);

        // All funds distributed
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    // ── E2E lifecycle tests ──

    function test_e2e_happyPath() public {
        uint256 jobId = _createAndFundJob();
        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Funded));

        escrow.markDone(jobId, _signMarkDone(providerPk, jobId));
        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Done));

        escrow.acceptResult(jobId, _signAcceptResult(buyerPk, jobId));
        assertEq(uint8(escrow.getJob(jobId).status), uint8(StringEscrow.JobStatus.Settled));

        uint256 fee = (AMOUNT * 500) / 10_000;
        assertEq(usdc.balanceOf(provider), AMOUNT - fee);
        assertEq(usdc.balanceOf(feeRecipient), fee);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_e2e_timeoutPath() public {
        uint256 jobId = _createAndFundJob();
        escrow.markDone(jobId, _signMarkDone(providerPk, jobId));
        vm.warp(block.timestamp + 24 hours + 1);

        escrow.claimTimeout(jobId);

        uint256 fee = (AMOUNT * 500) / 10_000;
        assertEq(usdc.balanceOf(provider), AMOUNT - fee);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_e2e_disputePath() public {
        uint256 jobId = _createAndFundJob();
        escrow.markDone(jobId, _signMarkDone(providerPk, jobId));
        escrow.dispute(jobId, _signDispute(buyerPk, jobId));

        // Judge gives 70/30 split to provider
        uint256 buyerAmt = (AMOUNT * 30) / 100;
        uint256 providerAmt = AMOUNT - buyerAmt;
        escrow.resolveDispute(jobId, buyerAmt, providerAmt);

        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_e2e_forceClosePath() public {
        uint256 jobId = _createAndFundJob();
        uint256 buyerBefore = usdc.balanceOf(buyer);
        vm.warp(block.timestamp + 7 days + 1);

        escrow.forceClose(jobId);

        assertEq(usdc.balanceOf(buyer), buyerBefore + AMOUNT);
        assertEq(usdc.balanceOf(address(escrow)), 0);
    }

    function test_e2e_multipleJobs() public {
        uint256 job0 = _createAndFundJob(bytes32(uint256(1)));
        uint256 job1 = _createAndFundJob(bytes32(uint256(2)));

        assertEq(job0, 0);
        assertEq(job1, 1);
        assertEq(usdc.balanceOf(address(escrow)), AMOUNT * 2);

        // Settle job0 happy path
        escrow.markDone(job0, _signMarkDone(providerPk, job0));
        escrow.acceptResult(job0, _signAcceptResult(buyerPk, job0));

        // Force close job1
        vm.warp(block.timestamp + 7 days + 1);
        escrow.forceClose(job1);

        assertEq(usdc.balanceOf(address(escrow)), 0);
    }
}
